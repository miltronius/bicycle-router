import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { DEFAULT_POINT_A, DEFAULT_POINT_B, DEFAULT_PROFILE_KEYS, PROFILES } from './constants';
import type { Point, HoverLatLng, Route } from './types';
import MapView from './components/MapView';
import type { ColorBy } from './components/MapView';
import Sidebar from './components/Sidebar';
import ElevationPanel from './components/ElevationPanel';
import LiveHUD from './components/LiveHUD';
import RideSummary from './components/RideSummary';
import { useRoutes } from './hooks/useRoutes';
import { useGeolocation } from './hooks/useGeolocation';
import { useWakeLock } from './hooks/useWakeLock';
import { reverseGeocode } from './services/geocode';
import { fetchPoisAlong } from './services/overpass';
import { decodeState, encodeState, inBounds } from './lib/url';
import { load, save } from './lib/storage';
import { formatLatLng, snapToLine } from './lib/geo';
import { DEFAULT_RIDER } from './lib/physics';
import type { RiderSettings } from './lib/physics';
import { POI_CATEGORIES } from './lib/poi';
import type { Poi, PoiCategory } from './lib/poi';
import { initialTracker, shouldReroute, updateTracker } from './lib/live';
import type { TrackerState } from './lib/live';

export type PaceMode = 'brouter' | 'mine';
export interface PoiOnRoute extends Poi { distAlong: number; offset: number }

const REROUTE_COOLDOWN_MS = 30000;

function initialWaypoints(): (Point | null)[] {
  const fromUrl = decodeState(window.location.search).waypoints;
  if (fromUrl) return fromUrl;
  const last = load<Point[] | null>('zv.waypoints', null);
  if (Array.isArray(last) && last.length >= 2 && last.every(w => w && inBounds(w.lat, w.lng))) return last;
  return [DEFAULT_POINT_A, DEFAULT_POINT_B];
}

export default function App() {
  const urlState = useMemo(() => decodeState(window.location.search), []);

  // ── Planning state ──────────────────────────────────────────────
  const [waypoints, setWaypoints]   = useState<(Point | null)[]>(initialWaypoints);
  const [profileKeys, setProfileKeys] = useState<string[]>(() => {
    const keys = load<string[]>('zv.profiles', DEFAULT_PROFILE_KEYS).filter(k => PROFILES.some(p => p.key === k));
    return keys.length ? keys : DEFAULT_PROFILE_KEYS;
  });
  const [preferredProfile, setPreferredProfile] = useState<string | undefined>(urlState.profile);
  const [activeRouteIdx, setActiveRouteIdx] = useState(0);
  const [rider, setRider]           = useState<RiderSettings>(() => load('zv.rider', DEFAULT_RIDER));
  const [paceMode, setPaceMode]     = useState<PaceMode>(() => load<PaceMode>('zv.pace', 'mine'));
  const [colorBy, setColorBy]       = useState<ColorBy>('profile');
  const [baseMap, setBaseMap]       = useState<string>(() => urlState.map ?? load('zv.basemap', 'auto'));
  const [overlays, setOverlays]     = useState<string[]>(() => load<string[]>('zv.overlays', []));
  const [poiCats, setPoiCats]       = useState<PoiCategory[]>(() =>
    load<PoiCategory[]>('zv.poicats', POI_CATEGORIES.filter(c => c.default).map(c => c.id)));
  const [pois, setPois]             = useState<Poi[]>([]);
  const [poiStatus, setPoiStatus]   = useState<'idle' | 'loading' | 'error'>('idle');

  // ── UI state ────────────────────────────────────────────────────
  const [hoverLatLng, setHoverLatLng] = useState<HoverLatLng | null>(null);
  const [flashMsg, setFlashMsg]     = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(340);
  const [elevationHeight, setElevationHeight] = useState(170);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  // ── Location & live mode ────────────────────────────────────────
  const [locating, setLocating]     = useState(false);
  const [recenterNonce, setRecenterNonce] = useState(0);
  const [live, setLive]             = useState(false);
  const [liveProfile, setLiveProfile] = useState<string | null>(null);
  const [tracker, setTracker]       = useState<TrackerState>(initialTracker);
  const [finishedRide, setFinishedRide] = useState<TrackerState | null>(null);
  const lastRerouteRef = useRef(0);

  const { fix, error: geoError } = useGeolocation(locating || live);
  useWakeLock(live);

  const effectiveProfiles = live && liveProfile ? [liveProfile] : profileKeys;
  const { routes, loading, error } = useRoutes(waypoints, effectiveProfiles);

  // Keep the last good route on screen while a live reroute is loading.
  const lastRouteRef = useRef<Route | null>(null);
  const activeRoute: Route | null = routes[activeRouteIdx] ?? routes[0] ?? (live ? lastRouteRef.current : null);
  useEffect(() => { if (routes[activeRouteIdx]) lastRouteRef.current = routes[activeRouteIdx]; }, [routes, activeRouteIdx]);

  // Refs mirror state so stable callbacks can read current values without stale closures
  const waypointsRef = useRef(waypoints);
  useEffect(() => { waypointsRef.current = waypoints; }, [waypoints]);

  // Select the preferred profile when a new set of routes arrives
  const preferredRef = useRef(preferredProfile);
  useEffect(() => { preferredRef.current = preferredProfile; }, [preferredProfile]);
  useEffect(() => {
    const i = routes.findIndex(r => r.key === preferredRef.current);
    setActiveRouteIdx(i >= 0 ? i : 0);
  }, [routes]);

  // ── Persistence & shareable URL (#8) ────────────────────────────
  useEffect(() => { save('zv.rider', rider); }, [rider]);
  useEffect(() => { save('zv.pace', paceMode); }, [paceMode]);
  useEffect(() => { save('zv.profiles', profileKeys); }, [profileKeys]);
  useEffect(() => { save('zv.basemap', baseMap); }, [baseMap]);
  useEffect(() => { save('zv.overlays', overlays); }, [overlays]);
  useEffect(() => { save('zv.poicats', poiCats); }, [poiCats]);
  useEffect(() => {
    if (live) return; // don't spam the URL with live reroutes
    const complete = waypoints.every(Boolean) ? (waypoints as Point[]) : undefined;
    if (complete) save('zv.waypoints', complete);
    const qs = encodeState({ waypoints: complete, profile: activeRoute?.key, map: baseMap !== 'auto' ? baseMap : undefined });
    window.history.replaceState(null, '', `${window.location.pathname}${qs}${window.location.hash}`);
  }, [waypoints, activeRoute?.key, baseMap, live]);

  // Auto-clear flash message after 2.4 s
  useEffect(() => {
    if (!flashMsg) return;
    const t = setTimeout(() => setFlashMsg(null), 2400);
    return () => clearTimeout(t);
  }, [flashMsg]);

  // ── POIs along the active route (#10) ───────────────────────────
  const routeSig = activeRoute?.signature;
  useEffect(() => {
    if (!activeRoute || poiCats.length === 0) { setPois([]); setPoiStatus('idle'); return; }
    const ctrl = new AbortController();
    setPoiStatus('loading');
    // Small delay so quick route switching doesn't fire a query each time
    const t = setTimeout(() => {
      fetchPoisAlong(activeRoute.signature, activeRoute.data.features[0].geometry.coordinates, poiCats, 150, ctrl.signal)
        .then(p => { setPois(p); setPoiStatus('idle'); })
        .catch(e => { if ((e as Error).name !== 'AbortError') setPoiStatus('error'); });
    }, 600);
    return () => { clearTimeout(t); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-query only when the track or categories change
  }, [routeSig, poiCats]);

  const poisOnRoute = useMemo<PoiOnRoute[]>(() => {
    if (!activeRoute) return [];
    const coords = activeRoute.data.features[0].geometry.coordinates;
    return pois
      .map(p => {
        const s = snapToLine([p.lng, p.lat], coords, activeRoute.cum);
        return { ...p, distAlong: s?.distAlong ?? 0, offset: s?.offset ?? 0 };
      })
      .sort((a, b) => a.distAlong - b.distAlong);
  }, [pois, activeRoute]);

  // ── Waypoint editing ────────────────────────────────────────────
  const setWaypointAt = useCallback((idx: number, p: Point | null) => {
    setWaypoints(w => w.map((x, i) => (i === idx ? p : x)));
  }, []);

  /** Set coordinates now, replace the name when reverse geocoding resolves (if unchanged). */
  const placeWithGeocode = useCallback((idx: number, lat: number, lng: number) => {
    setWaypointAt(idx, { lat, lng, name: formatLatLng(lat, lng) });
    reverseGeocode(lat, lng).then(name =>
      setWaypoints(w => w.map((x, i) => (i === idx && x?.lat === lat && x?.lng === lng ? { ...x, name } : x))),
    );
  }, [setWaypointAt]);

  const handleMapClick = useCallback((lat: number, lng: number) => {
    const idx = waypointsRef.current.findIndex(w => w === null);
    if (idx >= 0) placeWithGeocode(idx, lat, lng);
    else setFlashMsg('All stops set — drag a pin, or add a stop.');
  }, [placeWithGeocode]);

  const handleDragEnd = useCallback((idx: number, lat: number, lng: number) => {
    placeWithGeocode(idx, lat, lng);
  }, [placeWithGeocode]);

  const handleAddStop = useCallback(() => {
    setWaypoints(w => (w.length >= 10 ? w : [...w.slice(0, -1), null, w[w.length - 1]]));
    setFlashMsg('Click the map or search to place the new stop.');
  }, []);

  const handleRemoveStop = useCallback((idx: number) => {
    setWaypoints(w => (w.length > 2 ? w.filter((_, i) => i !== idx) : w.map((x, i) => (i === idx ? null : x))));
  }, []);

  const handleMoveStop = useCallback((idx: number, dir: -1 | 1) => {
    setWaypoints(w => {
      const j = idx + dir;
      if (j < 0 || j >= w.length) return w;
      const c = w.slice();
      [c[idx], c[j]] = [c[j], c[idx]];
      return c;
    });
  }, []);

  const handleReverse = useCallback(() => setWaypoints(w => w.slice().reverse()), []);

  /** Insert a point as a stop at the position matching its distance along the active route. */
  const insertStopAlongRoute = useCallback((p: Point) => {
    const route = activeRoute;
    setWaypoints(w => {
      if (!route || !w.every(Boolean)) return [...w.slice(0, -1), p, w[w.length - 1]];
      const coords = route.data.features[0].geometry.coordinates;
      const along = (q: Point) => snapToLine([q.lng, q.lat], coords, route.cum)?.distAlong ?? 0;
      const d = along(p);
      const pts = w as Point[];
      let at = pts.length - 1;
      for (let i = 1; i < pts.length; i++) if (along(pts[i]) > d) { at = i; break; }
      return [...pts.slice(0, at), p, ...pts.slice(at)];
    });
    setFlashMsg(`Added “${p.name}” as a stop.`);
  }, [activeRoute]);

  const handleAddPoi = useCallback((poi: Poi) => {
    insertStopAlongRoute({ lat: poi.lat, lng: poi.lng, name: poi.name });
  }, [insertStopAlongRoute]);

  // ── My location (#3) ────────────────────────────────────────────
  const handleLocate = useCallback(() => {
    setLocating(true);
    setRecenterNonce(n => n + 1);
  }, []);

  const handleUseLocationAsStart = useCallback(() => {
    if (!fix) return;
    if (!inBounds(fix.lat, fix.lng)) { setFlashMsg('You seem to be outside Switzerland.'); return; }
    setWaypoints(w => [{ lat: fix.lat, lng: fix.lng, name: 'My location' }, ...w.slice(1)]);
  }, [fix]);

  useEffect(() => { if (geoError) setFlashMsg(geoError); }, [geoError]);

  // ── Live mode (#6) ──────────────────────────────────────────────
  const startLive = useCallback((idx: number) => {
    const r = routes[idx];
    if (!r) return;
    setActiveRouteIdx(idx);
    setPreferredProfile(r.key);
    setLiveProfile(r.key);
    setTracker(initialTracker());
    lastRerouteRef.current = 0;
    setLive(true);
    setMobileSheetOpen(false);
    setRecenterNonce(n => n + 1);
  }, [routes]);

  const stopLive = useCallback(() => {
    setLive(false);
    setLiveProfile(null);
    setFinishedRide(t => (tracker.track.length > 1 ? tracker : t));
  }, [tracker]);

  // Reset route matching when the route geometry changes (reroute / new stop)
  useEffect(() => {
    setTracker(t => ({ ...t, segIdx: undefined, offRouteSince: null }));
  }, [routeSig]);

  // Feed GPS fixes into the tracker
  useEffect(() => {
    if (!live || !fix || !activeRoute) return;
    setTracker(t => updateTracker(t, fix, activeRoute.data.features[0].geometry.coordinates, activeRoute.cum));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run per fix only
  }, [fix, live]);

  // Off-route → reroute from the current position to the remaining stops
  useEffect(() => {
    if (!live || !fix || !activeRoute || loading) return;
    const now = Date.now();
    if (!shouldReroute(tracker, fix.timestamp) || now - lastRerouteRef.current < REROUTE_COOLDOWN_MS) return;
    lastRerouteRef.current = now;
    const coords = activeRoute.data.features[0].geometry.coordinates;
    const pts = waypointsRef.current.filter(Boolean) as Point[];
    const remaining = pts.slice(1).filter(p =>
      (snapToLine([p.lng, p.lat], coords, activeRoute.cum)?.distAlong ?? Infinity) > tracker.distAlong);
    const rest = remaining.length ? remaining : [pts[pts.length - 1]];
    setWaypoints([{ lat: fix.lat, lng: fix.lng, name: 'My position' }, ...rest]);
    setFlashMsg('Off route — recalculating…');
  }, [tracker, fix, live, activeRoute, loading]);

  // ── Panel resizing (pointer events → mouse + touch + pen) ────────
  const startDrag = useCallback((e: React.PointerEvent, onMove: (dx: number, dy: number) => void) => {
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const move = (ev: PointerEvent) => onMove(ev.clientX - sx, ev.clientY - sy);
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  }, []);

  const handleSidebarResizeStart = useCallback((e: React.PointerEvent) => {
    const w0 = sidebarWidth;
    startDrag(e, dx => setSidebarWidth(Math.min(600, Math.max(260, w0 + dx))));
  }, [sidebarWidth, startDrag]);

  const handleElevationResizeStart = useCallback((e: React.PointerEvent) => {
    const h0 = elevationHeight;
    startDrag(e, (_dx, dy) => setElevationHeight(Math.min(400, Math.max(80, h0 - dy))));
  }, [elevationHeight, startDrag]);

  const handleSelectRoute = useCallback((idx: number) => {
    setActiveRouteIdx(idx);
    if (routes[idx]) setPreferredProfile(routes[idx].key);
  }, [routes]);

  const handleCopyLink = useCallback(() => {
    void navigator.clipboard?.writeText(window.location.href).then(
      () => setFlashMsg('Link copied to clipboard.'),
      () => setFlashMsg('Could not copy — use the address bar.'),
    );
  }, []);

  // Derived status text for the mode indicator in the sidebar
  const modeText = useMemo<string | null>(() => {
    if (flashMsg) return flashMsg;
    const idx = waypoints.findIndex(w => w === null);
    if (idx === 0) return 'Click the map to set your starting point';
    if (idx === waypoints.length - 1) return 'Now click to set your destination';
    if (idx > 0) return `Click the map to place stop ${String.fromCharCode(65 + idx)}`;
    return null;
  }, [waypoints, flashMsg]);

  return (
    <div
      className={`app${live ? ' is-live' : ''}`}
      style={{
        '--sidebar-width':   `${sidebarWidth}px`,
        '--elevation-height': `${elevationHeight}px`,
      } as React.CSSProperties}
    >
      <Sidebar
        waypoints={waypoints}
        routes={routes}
        activeRouteIdx={activeRouteIdx}
        loading={loading}
        error={error}
        modeText={modeText}
        mobileSheetOpen={mobileSheetOpen}
        rider={rider}
        paceMode={paceMode}
        profileKeys={profileKeys}
        colorBy={colorBy}
        baseMap={baseMap}
        overlays={overlays}
        poiCats={poiCats}
        poisOnRoute={poisOnRoute}
        poiStatus={poiStatus}
        hasFix={!!fix}
        onSetWaypoint={setWaypointAt}
        onRemoveStop={handleRemoveStop}
        onMoveStop={handleMoveStop}
        onAddStop={handleAddStop}
        onReverse={handleReverse}
        onUseLocation={handleUseLocationAsStart}
        onLocate={handleLocate}
        onCopyLink={handleCopyLink}
        onSelectRoute={idx => { handleSelectRoute(idx); setMobileSheetOpen(false); }}
        onStartLive={startLive}
        onRiderChange={setRider}
        onPaceModeChange={setPaceMode}
        onProfileKeysChange={setProfileKeys}
        onColorByChange={setColorBy}
        onBaseMapChange={setBaseMap}
        onOverlaysChange={setOverlays}
        onPoiCatsChange={setPoiCats}
        onAddPoi={handleAddPoi}
        onHoverPoi={p => setHoverLatLng(p ? { lat: p.lat, lon: p.lng } : null)}
        onMobileOpen={() => setMobileSheetOpen(true)}
        onMobileClose={() => setMobileSheetOpen(false)}
      />
      <div className="sidebar-resize-handle" onPointerDown={handleSidebarResizeStart} />
      {/* Mobile backdrop — tapping the map while the sheet is open closes it */}
      {mobileSheetOpen && (
        <div className="fixed inset-0 z-299 md:hidden" onClick={() => setMobileSheetOpen(false)} />
      )}
      {/* Mobile bottom controls — hidden on desktop, when the sheet is open, and in live mode */}
      {!mobileSheetOpen && !live && (
        routes.length > 0 ? (
          <button
            onClick={() => setMobileSheetOpen(true)}
            className="fixed bottom-5 left-4 z-200 md:hidden flex items-center gap-2 bg-paper border border-line-soft rounded-full pl-2.5 pr-4 py-2 shadow-card cursor-pointer"
          >
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: activeRoute?.color }} />
            <span className="font-mono text-[11px] tracking-[0.12em] text-ink">{activeRoute?.name}</span>
          </button>
        ) : (
          <button
            onClick={() => setMobileSheetOpen(true)}
            className="fixed bottom-5 left-1/2 -translate-x-1/2 z-200 md:hidden bg-ink text-paper font-mono text-[11px] tracking-[0.15em] uppercase px-5 py-3 rounded-full shadow-card hover:bg-alpine transition-colors cursor-pointer flex items-center gap-2"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M1 4h14v1.5H1zm0 4h14v1.5H1zm0 4h9v1.5H1z"/></svg>
            Plan route
          </button>
        )
      )}
      <MapView
        waypoints={waypoints}
        routes={routes}
        activeRoute={activeRoute}
        activeRouteIdx={activeRouteIdx}
        hoverLatLng={hoverLatLng}
        colorBy={colorBy}
        baseMap={baseMap}
        overlays={overlays}
        pois={poisOnRoute}
        userFix={fix}
        recenterNonce={recenterNonce}
        follow={live}
        onMapClick={handleMapClick}
        onDragEnd={handleDragEnd}
        onRouteClick={handleSelectRoute}
        onLocate={handleLocate}
        onAddPoi={handleAddPoi}
      />
      {live && activeRoute && (
        <LiveHUD
          route={activeRoute}
          tracker={tracker}
          fix={fix}
          rider={rider}
          pois={poisOnRoute}
          rerouting={loading}
          poiCats={poiCats}
          onPoiCatsChange={setPoiCats}
          onAddPoi={handleAddPoi}
          onStop={stopLive}
          onRecenter={() => setRecenterNonce(n => n + 1)}
        />
      )}
      {finishedRide && !live && (
        <RideSummary tracker={finishedRide} routeName={activeRoute?.name ?? 'Ride'} onClose={() => setFinishedRide(null)} />
      )}
      <ElevationPanel
        route={activeRoute}
        rider={rider}
        progressDist={live ? tracker.distAlong : null}
        onHoverChange={setHoverLatLng}
        onResizeStart={handleElevationResizeStart}
      />
    </div>
  );
}
