import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { INITIAL_CENTER, INITIAL_ZOOM, BOUNDS_SW, BOUNDS_NE, API_KEYS, buildTileProviders } from '../constants';
import type { Point, Route, HoverLatLng, PointKey, TileProvider } from '../types';

const TILE_PROVIDERS: TileProvider[] = buildTileProviders(API_KEYS);

interface RouteDrawing {
  layer: L.LayerGroup;
  line:  L.Polyline;
  halo:  L.Polyline;
}

interface Props {
  pointA:        Point | null;
  pointB:        Point | null;
  routes:        Route[];
  activeRouteIdx: number;
  hoverLatLng:   HoverLatLng | null;
  onMapClick:    (lat: number, lng: number) => void;
  onDragEnd:     (which: PointKey, lat: number, lng: number) => void;
  onRouteClick:  (idx: number) => void;
}

function makeMarkerIcon(letter: 'A' | 'B') {
  return L.divIcon({
    className: '',
    html: `<div class="marker-pin ${letter.toLowerCase()}"><div class="pin-body"><span>${letter}</span></div></div>`,
    iconSize:   [32, 40],
    iconAnchor: [16, 40],
  });
}

export default function MapView({
  pointA, pointB, routes, activeRouteIdx, hoverLatLng,
  onMapClick, onDragEnd, onRouteClick,
}: Props) {
  const containerRef    = useRef<HTMLDivElement>(null);
  const mapRef          = useRef<L.Map | null>(null);
  const markerARef      = useRef<L.Marker | null>(null);
  const markerBRef      = useRef<L.Marker | null>(null);
  const routeDrawings   = useRef<RouteDrawing[]>([]);
  const hoverMarkerRef  = useRef<L.CircleMarker | null>(null);
  const activeTileRef   = useRef<L.TileLayer | null>(null);
  const tileTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [tileStatus, setTileStatus]     = useState<string | null>('Loading tiles…');
  const [showTileError, setShowTileError] = useState(false);

  // Keep callback refs fresh so map event listeners never hold stale closures
  const onMapClickRef   = useRef(onMapClick);
  const onDragEndRef    = useRef(onDragEnd);
  const onRouteClickRef = useRef(onRouteClick);
  useEffect(() => { onMapClickRef.current   = onMapClick;   }, [onMapClick]);
  useEffect(() => { onDragEndRef.current    = onDragEnd;    }, [onDragEnd]);
  useEffect(() => { onRouteClickRef.current = onRouteClick; }, [onRouteClick]);

  // Recursive tile failover — stored in a ref so setTimeout closures always call
  // the latest version even after re-renders.
  const activateProviderRef = useRef<(idx: number, map: L.Map) => void>(null!);
  activateProviderRef.current = (idx: number, map: L.Map) => {
    if (idx >= TILE_PROVIDERS.length) {
      setTileStatus(null);
      setShowTileError(true);
      return;
    }
    const p = TILE_PROVIDERS[idx];
    setTileStatus(`Loading tiles · ${p.name}…`);

    if (activeTileRef.current) map.removeLayer(activeTileRef.current);
    const layer = L.tileLayer(p.url, p.opts);
    let succeeded = false;

    layer.on('tileload', () => {
      if (!succeeded) {
        succeeded = true;
        setTileStatus(null);
        if (tileTimerRef.current !== null) clearTimeout(tileTimerRef.current);
      }
    });

    tileTimerRef.current = setTimeout(() => {
      if (!succeeded) activateProviderRef.current(idx + 1, map);
    }, 4000);

    activeTileRef.current = layer;
    layer.addTo(map);
  };

  // ── Initialise Leaflet map (runs once) ────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const map = L.map(containerRef.current, {
      center:    INITIAL_CENTER,
      zoom:      INITIAL_ZOOM,
      zoomControl: true,
      maxBounds: L.latLngBounds(BOUNDS_SW, BOUNDS_NE),
      minZoom:   7,
      maxZoom:   18,
    });
    mapRef.current = map;

    // Start tile loading
    activateProviderRef.current(0, map);

    // Manual layer-picker (user can override auto-selected tile provider)
    const selectables: Record<string, L.TileLayer> = {};
    TILE_PROVIDERS.forEach(p => { selectables[p.name] = L.tileLayer(p.url, p.opts); });
    const layerControl = L.control.layers(selectables, undefined, { position: 'topleft', collapsed: true }).addTo(map);
    layerControl.getContainer()?.addEventListener('click', () => {
      if (tileTimerRef.current !== null) clearTimeout(tileTimerRef.current);
      setTileStatus(null);
    });

    // Route click / map-point placement
    const validBounds = L.latLngBounds(BOUNDS_SW, BOUNDS_NE);
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (validBounds.contains(e.latlng))
        onMapClickRef.current(e.latlng.lat, e.latlng.lng);
    });

    // Fix blank map from grid-layout sizing races
    setTimeout(() => map.invalidateSize(), 100);
    setTimeout(() => map.invalidateSize(), 500);
    const onResize = () => map.invalidateSize();
    window.addEventListener('resize', onResize);

    // Invalidate when the grid resizes (e.g. sidebar or elevation drag)
    const observer = new ResizeObserver(() => map.invalidateSize());
    if (containerRef.current) observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', onResize);
      if (tileTimerRef.current !== null) clearTimeout(tileTimerRef.current);
      map.remove();
      mapRef.current = null;
    };
  }, []); // deliberately empty — map is initialised once

  // ── Marker A ──────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (markerARef.current) { map.removeLayer(markerARef.current); markerARef.current = null; }
    if (!pointA) return;
    const m = L.marker([pointA.lat, pointA.lng], { icon: makeMarkerIcon('A'), draggable: true }).addTo(map);
    m.on('dragend', () => {
      const ll = m.getLatLng();
      onDragEndRef.current('a', ll.lat, ll.lng);
    });
    markerARef.current = m;
  }, [pointA]);

  // ── Marker B ──────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (markerBRef.current) { map.removeLayer(markerBRef.current); markerBRef.current = null; }
    if (!pointB) return;
    const m = L.marker([pointB.lat, pointB.lng], { icon: makeMarkerIcon('B'), draggable: true }).addTo(map);
    m.on('dragend', () => {
      const ll = m.getLatLng();
      onDragEndRef.current('b', ll.lat, ll.lng);
    });
    markerBRef.current = m;
  }, [pointB]);

  // ── Draw routes ───────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear previous drawings
    routeDrawings.current.forEach(d => map.removeLayer(d.layer));
    routeDrawings.current = [];
    if (hoverMarkerRef.current) { map.removeLayer(hoverMarkerRef.current); hoverMarkerRef.current = null; }

    if (routes.length === 0) return;

    routes.forEach((r, idx) => {
      const coords = r.data.features[0].geometry.coordinates.map(c => [c[1], c[0]] as L.LatLngTuple);
      const halo = L.polyline(coords, { color: '#fff', weight: 6, opacity: 0.85, lineJoin: 'round', lineCap: 'round' });
      const line = L.polyline(coords, { color: r.color, weight: 3.5, opacity: 0.95, lineJoin: 'round', lineCap: 'round' });
      const layer = L.layerGroup([halo, line]).addTo(map);
      line.on('click', () => onRouteClickRef.current(idx));
      halo.on('click', () => onRouteClickRef.current(idx));
      routeDrawings.current.push({ layer, line, halo });
    });

    // Fit map viewport to show all routes
    const allCoords = routes.flatMap(r =>
      r.data.features[0].geometry.coordinates.map(c => [c[1], c[0]] as L.LatLngTuple)
    );
    map.fitBounds(L.latLngBounds(allCoords).pad(0.1));
  }, [routes]);

  // ── Update active route style ─────────────────────────────────────
  useEffect(() => {
    routeDrawings.current.forEach(({ line, halo }, i) => {
      const active = i === activeRouteIdx;
      line.setStyle({ weight: active ? 4.5 : 3, opacity: active ? 1 : 0.55 });
      halo.setStyle({ weight: active ? 7 : 5, opacity: active ? 0.95 : 0.45 });
      if (active) line.bringToFront();
    });
  }, [activeRouteIdx, routes]);

  // ── Elevation hover marker ────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (hoverMarkerRef.current) { map.removeLayer(hoverMarkerRef.current); hoverMarkerRef.current = null; }
    if (!hoverLatLng) return;
    const color = routes[activeRouteIdx]?.color ?? '#c83737';
    hoverMarkerRef.current = L.circleMarker([hoverLatLng.lat, hoverLatLng.lon], {
      radius: 7, color: '#fff', weight: 3,
      fillColor: color, fillOpacity: 1, interactive: false,
    }).addTo(map);
  }, [hoverLatLng, routes, activeRouteIdx]);

  return (
    <div className="area-map" style={{ position: 'relative', minHeight: 400 }}>
      {/* Leaflet mount point — absolute so height works regardless of grid sizing */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} className="bg-paper-2" />

      {/* Coordinate badge */}
      <div className="absolute top-3.5 right-3.5 z-[500] flex items-center gap-2 bg-paper px-3 py-2 rounded-md shadow-card font-mono text-[10px] tracking-[0.15em] uppercase text-ink-soft select-none">
        <span className="w-1.5 h-1.5 rounded-full bg-alpine" />
        Zürich · 47.37°N 8.54°E
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
              None of the public tile servers responded. Routing still works — but the basemap is missing.
              Paste a free <strong className="text-ink font-semibold">Thunderforest</strong> or{' '}
              <strong className="text-ink font-semibold">MapTiler</strong> key into{' '}
              <code className="font-mono bg-paper-2 px-1 rounded">API_KEYS</code> in{' '}
              <code className="font-mono bg-paper-2 px-1 rounded">src/constants.ts</code>.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowTileError(false);
                  const m = mapRef.current;
                  if (m) activateProviderRef.current(0, m);
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
        className="absolute bottom-3.5 right-3.5 w-14 h-14 z-[500] pointer-events-none opacity-85"
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
