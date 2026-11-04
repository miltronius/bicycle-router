import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { INITIAL_CENTER, INITIAL_ZOOM, BOUNDS_SW, BOUNDS_NE, API_KEYS, OVERLAYS, buildTileProviders } from '../constants';
import type { Point, Route, HoverLatLng, TileProvider } from '../types';
import type { GeoFix } from '../hooks/useGeolocation';
import type { PoiOnRoute } from '../App';
import type { Poi } from '../lib/poi';
import { POI_BY_ID } from '../lib/poi';
import { formatDistance } from '../lib/geo';
import { classifySafety, classifySurface, runsBy, SAFETY_COLORS, SURFACE_COLORS } from '../lib/safety';

export const TILE_PROVIDERS: TileProvider[] = buildTileProviders(API_KEYS);

export type ColorBy = 'profile' | 'safety' | 'surface';

interface RouteDrawing {
  layer: L.LayerGroup;
  line:  L.Polyline;
  halo:  L.Polyline;
}

interface Props {
  waypoints:      (Point | null)[];
  routes:         Route[];
  activeRoute:    Route | null;
  activeRouteIdx: number;
  hoverLatLng:    HoverLatLng | null;
  colorBy:        ColorBy;
  baseMap:        string;
  overlays:       string[];
  pois:           PoiOnRoute[];
  userFix:        GeoFix | null;
  recenterNonce:  number;
  follow:         boolean;
  onMapClick:     (lat: number, lng: number) => void;
  onDragEnd:      (idx: number, lat: number, lng: number) => void;
  onRouteClick:   (idx: number) => void;
  onLocate:       () => void;
  onAddPoi:       (poi: Poi) => void;
}

export function waypointLetter(idx: number): string {
  return String.fromCharCode(65 + idx);
}

function makeMarkerIcon(idx: number, total: number) {
  const cls = idx === 0 ? 'a' : idx === total - 1 ? 'b' : 'via';
  return L.divIcon({
    className: '',
    html: `<div class="marker-pin ${cls}"><div class="pin-body"><span>${waypointLetter(idx)}</span></div></div>`,
    iconSize:   [32, 40],
    iconAnchor: [16, 40],
  });
}

function poiIcon(category: Poi['category']) {
  return L.divIcon({
    className: '',
    html: `<div class="poi-pin" title="${POI_BY_ID[category].label}">${POI_BY_ID[category].icon}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

/** Slice a route's coordinates between two distances (m) along it. */
function sliceCoords(coords: number[][], cum: number[], from: number, to: number): L.LatLngTuple[] {
  const out: L.LatLngTuple[] = [];
  for (let i = 0; i < coords.length; i++) {
    if (cum[i] >= from && cum[i] <= to) out.push([coords[i][1], coords[i][0]]);
    else if (cum[i] > to) { out.push([coords[i][1], coords[i][0]]); break; }
    else if (i + 1 < coords.length && cum[i + 1] > from && out.length === 0) out.push([coords[i][1], coords[i][0]]);
  }
  return out;
}

export default function MapView({
  waypoints, routes, activeRoute, activeRouteIdx, hoverLatLng, colorBy, baseMap, overlays, pois,
  userFix, recenterNonce, follow,
  onMapClick, onDragEnd, onRouteClick, onLocate, onAddPoi,
}: Props) {
  const containerRef    = useRef<HTMLDivElement>(null);
  const mapRef          = useRef<L.Map | null>(null);
  const markersRef      = useRef<L.Marker[]>([]);
  const routeDrawings   = useRef<RouteDrawing[]>([]);
  const classLayerRef   = useRef<L.LayerGroup | null>(null);
  const poiLayerRef     = useRef<L.LayerGroup | null>(null);
  const userLayerRef    = useRef<L.LayerGroup | null>(null);
  const hoverMarkerRef  = useRef<L.CircleMarker | null>(null);
  const activeTileRef   = useRef<L.TileLayer | null>(null);
  const overlayLayers   = useRef<Map<string, L.TileLayer>>(new Map());
  const tileTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [tileStatus, setTileStatus]       = useState<string | null>('Loading tiles…');
  const [showTileError, setShowTileError] = useState(false);
  const [center, setCenter]               = useState<L.LatLng>(L.latLng(INITIAL_CENTER));

  // Keep callback refs fresh so map event listeners never hold stale closures
  const onMapClickRef   = useRef(onMapClick);
  const onDragEndRef    = useRef(onDragEnd);
  const onRouteClickRef = useRef(onRouteClick);
  const onAddPoiRef     = useRef(onAddPoi);
  useEffect(() => {
    onMapClickRef.current   = onMapClick;
    onDragEndRef.current    = onDragEnd;
    onRouteClickRef.current = onRouteClick;
    onAddPoiRef.current     = onAddPoi;
  });

  // Tile loading with failover. In 'auto' mode, try providers in order; with an
  // explicit choice, load just that one (no failover, no duplicate layers).
  const activateProviderRef = useRef<(idx: number, map: L.Map, auto: boolean) => void>(null!);
  activateProviderRef.current = (idx: number, map: L.Map, auto: boolean) => {
    if (tileTimerRef.current !== null) { clearTimeout(tileTimerRef.current); tileTimerRef.current = null; }
    if (idx >= TILE_PROVIDERS.length) {
      setTileStatus(null);
      setShowTileError(true);
      return;
    }
    const p = TILE_PROVIDERS[idx];
    setTileStatus(`Loading tiles · ${p.name}…`);
    setShowTileError(false);

    if (activeTileRef.current) map.removeLayer(activeTileRef.current);
    const layer = L.tileLayer(p.url, p.opts);
    let succeeded = false;
    layer.on('tileload', () => {
      if (succeeded) return;
      succeeded = true;
      setTileStatus(null);
      if (tileTimerRef.current !== null) { clearTimeout(tileTimerRef.current); tileTimerRef.current = null; }
    });
    tileTimerRef.current = setTimeout(() => {
      if (succeeded) return;
      if (auto) activateProviderRef.current(idx + 1, map, true);
      else setTileStatus(`${p.name} is slow to respond…`);
    }, 4000);

    activeTileRef.current = layer;
    layer.addTo(map);
    layer.bringToBack();
  };

  // ── Initialise Leaflet map (runs once) ────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const map = L.map(containerRef.current, {
      center:    INITIAL_CENTER,
      zoom:      INITIAL_ZOOM,
      zoomControl: true,
      maxBounds: L.latLngBounds(BOUNDS_SW, BOUNDS_NE).pad(0.05),
      minZoom:   7,
      maxZoom:   19,
    });
    mapRef.current = map;
    classLayerRef.current = L.layerGroup().addTo(map);
    poiLayerRef.current   = L.layerGroup().addTo(map);
    userLayerRef.current  = L.layerGroup().addTo(map);

    const validBounds = L.latLngBounds(BOUNDS_SW, BOUNDS_NE);
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (validBounds.contains(e.latlng)) onMapClickRef.current(e.latlng.lat, e.latlng.lng);
    });
    map.on('moveend', () => setCenter(map.getCenter()));

    // Fix blank map from grid-layout sizing races
    const timers = [100, 500].map(ms => setTimeout(() => map.invalidateSize(), ms));
    // Invalidate when the container resizes (sidebar/elevation drag, window resize)
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(containerRef.current);

    const overlaysMap = overlayLayers.current;
    return () => {
      // Clear pending timers — under StrictMode the first map is removed
      // immediately and a late invalidateSize() would throw `_leaflet_pos`.
      timers.forEach(clearTimeout);
      observer.disconnect();
      if (tileTimerRef.current !== null) clearTimeout(tileTimerRef.current);
      overlaysMap.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []); // deliberately empty — map is initialised once

  // ── Base map selection ────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const idx = TILE_PROVIDERS.findIndex(p => p.id === baseMap);
    if (baseMap === 'auto' || idx < 0) activateProviderRef.current(0, map, true);
    else activateProviderRef.current(idx, map, false);
  }, [baseMap]);

  // ── Overlays (bike networks) ──────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const current = overlayLayers.current;
    for (const [id, layer] of current) {
      if (!overlays.includes(id)) { map.removeLayer(layer); current.delete(id); }
    }
    for (const id of overlays) {
      if (current.has(id)) continue;
      const def = OVERLAYS.find(o => o.id === id);
      if (!def) continue;
      const layer = L.tileLayer(def.url, { ...def.opts, zIndex: 5 }).addTo(map);
      current.set(id, layer);
    }
  }, [overlays]);

  // ── Waypoint markers ──────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];
    waypoints.forEach((w, idx) => {
      if (!w) return;
      const m = L.marker([w.lat, w.lng], {
        icon: makeMarkerIcon(idx, waypoints.length), draggable: true, title: w.name, zIndexOffset: 1000,
      }).addTo(map);
      m.on('dragend', () => {
        const ll = m.getLatLng();
        onDragEndRef.current(idx, ll.lat, ll.lng);
      });
      markersRef.current.push(m);
    });
  }, [waypoints]);

  // ── Draw routes ───────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    routeDrawings.current.forEach(d => map.removeLayer(d.layer));
    routeDrawings.current = [];
    if (routes.length === 0) return;

    routes.forEach((r, idx) => {
      const coords = r.data.features[0].geometry.coordinates.map(c => [c[1], c[0]] as L.LatLngTuple);
      const halo = L.polyline(coords, { color: '#fff', weight: 6, opacity: 0.85, lineJoin: 'round', lineCap: 'round' });
      const line = L.polyline(coords, { color: r.color, weight: 3.5, opacity: 0.95, lineJoin: 'round', lineCap: 'round' });
      const layer = L.layerGroup([halo, line]).addTo(map);
      line.on('click', e => { L.DomEvent.stopPropagation(e); onRouteClickRef.current(idx); });
      halo.on('click', e => { L.DomEvent.stopPropagation(e); onRouteClickRef.current(idx); });
      routeDrawings.current.push({ layer, line, halo });
    });

    if (!follow) {
      const allCoords = routes.flatMap(r =>
        r.data.features[0].geometry.coordinates.map(c => [c[1], c[0]] as L.LatLngTuple));
      map.fitBounds(L.latLngBounds(allCoords).pad(0.1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- don't refit when follow toggles
  }, [routes]);

  // ── Active route style ────────────────────────────────────────────
  useEffect(() => {
    routeDrawings.current.forEach(({ line, halo }, i) => {
      const active = i === activeRouteIdx;
      const classMode = colorBy !== 'profile';
      line.setStyle({ weight: active ? 4.5 : 3, opacity: active ? (classMode ? 0 : 1) : 0.45 });
      halo.setStyle({ weight: active ? (classMode ? 8 : 7) : 5, opacity: active ? 0.95 : 0.4 });
      if (active) { halo.bringToFront(); line.bringToFront(); }
    });
  }, [activeRouteIdx, routes, colorBy]);

  // ── Safety / surface colouring of the active route (#11) ──────────
  useEffect(() => {
    const layer = classLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (colorBy === 'profile' || !activeRoute || activeRoute.segments.length === 0) return;
    const coords = activeRoute.data.features[0].geometry.coordinates;
    const fn = colorBy === 'safety' ? classifySafety : classifySurface;
    const colors: Record<string, string> = colorBy === 'safety' ? SAFETY_COLORS : SURFACE_COLORS;
    // BRouter message distances and geometry distances differ slightly — scale.
    const total = activeRoute.cum[activeRoute.cum.length - 1] || 1;
    const segTotal = activeRoute.segments[activeRoute.segments.length - 1].to || 1;
    const k = total / segTotal;
    for (const run of runsBy(activeRoute.segments, fn)) {
      const pts = sliceCoords(coords, activeRoute.cum, run.from * k, run.to * k);
      if (pts.length < 2) continue;
      L.polyline(pts, { color: colors[run.cls], weight: 5, opacity: 1, lineCap: 'butt', interactive: false }).addTo(layer);
    }
  }, [activeRoute, colorBy]);

  // ── POI markers (#10) ─────────────────────────────────────────────
  useEffect(() => {
    const layer = poiLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const p of pois) {
      const m = L.marker([p.lat, p.lng], { icon: poiIcon(p.category), title: p.name });
      const el = document.createElement('div');
      el.className = 'poi-popup';
      const title = document.createElement('div');
      title.className = 'poi-popup-title';
      title.textContent = `${POI_BY_ID[p.category].icon} ${p.name}`;
      const meta = document.createElement('div');
      meta.className = 'poi-popup-meta';
      meta.textContent = `${POI_BY_ID[p.category].label} · ${formatDistance(p.distAlong)} along · ${Math.round(p.offset)} m off route`;
      el.append(title, meta);
      if (p.tags.opening_hours) {
        const oh = document.createElement('div');
        oh.className = 'poi-popup-meta';
        oh.textContent = `🕑 ${p.tags.opening_hours}`;
        el.append(oh);
      }
      const btn = document.createElement('button');
      btn.className = 'poi-popup-btn';
      btn.textContent = '+ Add as stop';
      btn.onclick = () => { onAddPoiRef.current(p); m.closePopup(); };
      el.append(btn);
      m.bindPopup(el);
      m.addTo(layer);
    }
  }, [pois]);

  // ── User location (#3) ────────────────────────────────────────────
  useEffect(() => {
    const layer = userLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!userFix) return;
    const ll: L.LatLngTuple = [userFix.lat, userFix.lng];
    L.circle(ll, { radius: userFix.accuracy, color: '#2b6cb0', weight: 1, fillOpacity: 0.08, interactive: false }).addTo(layer);
    const heading = userFix.heading;
    L.marker(ll, {
      interactive: false,
      zIndexOffset: 2000,
      icon: L.divIcon({
        className: '',
        html: `<div class="user-dot">${heading !== null ? `<div class="user-heading" style="transform:rotate(${heading}deg)"></div>` : ''}</div>`,
        iconSize: [22, 22], iconAnchor: [11, 11],
      }),
    }).addTo(layer);
    if (follow) mapRef.current?.panTo(ll, { animate: true });
  }, [userFix, follow]);

  // Recenter on the user when asked (locate button / live start)
  const userFixRef = useRef(userFix);
  useEffect(() => { userFixRef.current = userFix; }, [userFix]);
  const pendingRecenter = useRef(false);
  useEffect(() => { if (recenterNonce > 0) pendingRecenter.current = true; }, [recenterNonce]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pendingRecenter.current || !userFix) return;
    pendingRecenter.current = false;
    map.flyTo([userFix.lat, userFix.lng], Math.max(map.getZoom(), follow ? 17 : 15), { duration: 0.8 });
  }, [userFix, recenterNonce, follow]);

  // ── Elevation hover marker ────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (hoverMarkerRef.current) { map.removeLayer(hoverMarkerRef.current); hoverMarkerRef.current = null; }
    if (!hoverLatLng) return;
    const color = activeRoute?.color ?? '#c83737';
    hoverMarkerRef.current = L.circleMarker([hoverLatLng.lat, hoverLatLng.lon], {
      radius: 7, color: '#fff', weight: 3,
      fillColor: color, fillOpacity: 1, interactive: false,
    }).addTo(map);
  }, [hoverLatLng, activeRoute]);

  return (
    <div className="area-map" style={{ position: 'relative', minHeight: 400 }}>
      {/* Leaflet mount point — absolute so height works regardless of grid sizing */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} className="bg-paper-2" />

      {/* Locate-me button (#3) */}
      <button
        onClick={onLocate}
        title="Show my location"
        aria-label="Show my location"
        className="absolute left-[10px] top-[84px] z-[500] w-[34px] h-[34px] flex items-center justify-center bg-paper border-2 border-[rgba(0,0,0,0.2)] rounded text-ink hover:bg-paper-2 cursor-pointer"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
      </button>

      {/* Coordinate badge — shows the current map centre */}
      <div className="hide-live absolute top-3.5 right-3.5 z-[500] hidden sm:flex items-center gap-2 bg-paper px-3 py-2 rounded-md shadow-card font-mono text-[10px] tracking-[0.15em] uppercase text-ink-soft select-none">
        <span className="w-1.5 h-1.5 rounded-full bg-alpine" />
        {center.lat.toFixed(2)}°N {center.lng.toFixed(2)}°E
      </div>

      {/* Tile-loading status pill */}
      {tileStatus && (
        <div className="absolute right-3.5 z-[500] flex items-center gap-1.5 bg-paper border border-line rounded px-2.5 py-1.5 font-mono text-[10px] tracking-wider text-ink-soft shadow-soft"
             style={{ top: '54px' }}>
          <span className="w-2 h-2 rounded-full bg-alpine animate-velo-pulse" />
          {tileStatus}
        </div>
      )}

      {/* Tile error overlay */}
      {showTileError && (
        <div className="absolute inset-0 z-[600] bg-paper-2 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-paper border border-line rounded-xl p-7 shadow-card">
            <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-muted mb-2">
              Diagnostic · 503
            </div>
            <h3 className="font-display text-[22px] font-medium tracking-tight mb-3">
              Map tiles couldn't{' '}
              <em className="italic font-normal text-alpine">load</em>
            </h3>
            <p className="text-[13px] text-ink-soft leading-relaxed mb-3">
              None of the tile servers responded. Routing still works — but the basemap is missing.
              Optionally add a free <strong className="text-ink font-semibold">Thunderforest</strong> or{' '}
              <strong className="text-ink font-semibold">MapTiler</strong> key in{' '}
              <code className="font-mono bg-paper-2 px-1 rounded">.env.local</code> (see{' '}
              <code className="font-mono bg-paper-2 px-1 rounded">.env.example</code>).
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowTileError(false);
                  const m = mapRef.current;
                  if (m) activateProviderRef.current(0, m, true);
                }}
                className="bg-ink text-paper font-mono text-[11px] tracking-[0.15em] uppercase px-4 py-2 rounded hover:bg-alpine transition-colors cursor-pointer"
              >
                Retry
              </button>
              <button
                onClick={() => setShowTileError(false)}
                className="bg-transparent text-ink border border-line font-mono text-[11px] tracking-[0.15em] uppercase px-4 py-2 rounded hover:bg-paper-2 transition-colors cursor-pointer"
              >
                Continue without map
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compass rose */}
      <svg
        className="hide-live absolute bottom-3.5 right-3.5 w-14 h-14 z-[500] pointer-events-none opacity-85 hidden md:block"
        viewBox="0 0 60 60"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="30" cy="30" r="26" fill="rgba(244,239,230,0.85)" stroke="#1c1f26" strokeWidth="0.8" />
        <circle cx="30" cy="30" r="22" fill="none" stroke="#c9b896" strokeWidth="0.5" />
        <path d="M30,8 L33,30 L30,52 L27,30 Z" fill="#1c1f26" />
        <path d="M30,8 L33,30 L30,30 Z" fill="#c83737" />
        <text x="30" y="14" textAnchor="middle" fontFamily="Fraunces, serif" fontSize="6" fontWeight="600" fill="#1c1f26">N</text>
      </svg>
    </div>
  );
}
