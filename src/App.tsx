import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { PROFILES, DEFAULT_POINT_A, DEFAULT_POINT_B, buildElevationProfile, computeSignature } from './constants';
import type { Point, Route, BRouterGeoJSON, HoverLatLng, PointKey } from './types';
import MapView from './components/MapView';
import Sidebar from './components/Sidebar';
import ElevationPanel from './components/ElevationPanel';

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=en`,
      { headers: { 'Accept-Language': 'en' } }
    );
    if (!res.ok) throw new Error();
    const data = await res.json();
    const a = data.address ?? {};
    const parts = [
      a.road ?? a.pedestrian ?? a.path ?? a.footway,
      a.suburb ?? a.quarter ?? a.neighbourhood ?? a.village ?? a.hamlet,
      a.city ?? a.town ?? a.municipality,
    ].filter(Boolean);
    return parts.slice(0, 2).join(', ') || (data.display_name ?? '').split(',')[0] || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

export default function App() {
  const [pointA, setPointA] = useState<Point | null>(DEFAULT_POINT_A);
  const [pointB, setPointB] = useState<Point | null>(DEFAULT_POINT_B);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [activeRouteIdx, setActiveRouteIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoverLatLng, setHoverLatLng] = useState<HoverLatLng | null>(null);
  const [flashMsg, setFlashMsg] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [elevationHeight, setElevationHeight] = useState(160);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  // Refs mirror state so stable callbacks can read current values without stale closures
  const pointARef = useRef<Point | null>(pointA);
  const pointBRef = useRef<Point | null>(pointB);
  useEffect(() => { pointARef.current = pointA; }, [pointA]);
  useEffect(() => { pointBRef.current = pointB; }, [pointB]);

  // Auto-clear flash message after 2.4 s
  useEffect(() => {
    if (!flashMsg) return;
    const t = setTimeout(() => setFlashMsg(null), 2400);
    return () => clearTimeout(t);
  }, [flashMsg]);

  // Fetch routes whenever both points are set; cancel in-flight on cleanup
  useEffect(() => {
    if (!pointA || !pointB) {
      setRoutes([]);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setRoutes([]);

    Promise.allSettled(
      PROFILES.map(p =>
        fetch(
          `https://brouter.de/brouter?lonlats=${pointA.lng},${pointA.lat}|${pointB.lng},${pointB.lat}&profile=${p.key}&alternativeidx=0&format=geojson`
        ).then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<BRouterGeoJSON>;
        })
      )
    ).then(results => {
      if (cancelled) return;

      let newRoutes: Route[] = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          newRoutes.push({ ...PROFILES[i], data: r.value, profilePoints: buildElevationProfile(r.value) });
        }
      });

      // Remove duplicate tracks (same GPS footprint, different profile names)
      const seen = new Set<string>();
      newRoutes = newRoutes.filter(r => {
        const sig = computeSignature(r.data);
        if (seen.has(sig)) return false;
        seen.add(sig);
        return true;
      });

      setLoading(false);
      if (newRoutes.length === 0) {
        setError('Could not compute any route. Try moving points closer to a road.');
      } else {
        setRoutes(newRoutes);
        setActiveRouteIdx(0);
      }
    });

    return () => { cancelled = true; };
  }, [pointA, pointB]);

  // Stable map-click handler — sets coords immediately, then replaces name when geocode resolves
  const handleMapClick = useCallback((lat: number, lng: number) => {
    const coordName = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    if (!pointARef.current) {
      setPointA({ lat, lng, name: coordName });
      reverseGeocode(lat, lng).then(name =>
        setPointA(p => (p?.lat === lat && p?.lng === lng ? { ...p, name } : p))
      );
    } else if (!pointBRef.current) {
      setPointB({ lat, lng, name: coordName });
      reverseGeocode(lat, lng).then(name =>
        setPointB(p => (p?.lat === lat && p?.lng === lng ? { ...p, name } : p))
      );
    } else {
      setFlashMsg('Both points set — drag a pin or clear a waypoint.');
    }
  }, []);

  const handleDragEnd = useCallback((which: PointKey, lat: number, lng: number) => {
    const coordName = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    if (which === 'a') {
      setPointA({ lat, lng, name: coordName });
      reverseGeocode(lat, lng).then(name =>
        setPointA(p => (p?.lat === lat && p?.lng === lng ? { ...p, name } : p))
      );
    } else {
      setPointB({ lat, lng, name: coordName });
      reverseGeocode(lat, lng).then(name =>
        setPointB(p => (p?.lat === lat && p?.lng === lng ? { ...p, name } : p))
      );
    }
  }, []);

  const handleSidebarResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth;
    const onMove = (ev: MouseEvent) =>
      setSidebarWidth(Math.min(600, Math.max(200, startW + ev.clientX - startX)));
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [sidebarWidth]);

  const handleElevationResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = elevationHeight;
    const onMove = (ev: MouseEvent) =>
      setElevationHeight(Math.min(400, Math.max(80, startH + startY - ev.clientY)));
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [elevationHeight]);

  const handleSetPoint = useCallback((which: PointKey, lat: number, lng: number, name: string) => {
    if (which === 'a') setPointA({ lat, lng, name });
    else setPointB({ lat, lng, name });
  }, []);

  const handleClearPoint = useCallback((which: PointKey) => {
    if (which === 'a') setPointA(null);
    else setPointB(null);
    setRoutes([]);
    setError(null);
  }, []);

  const handleSwapPoints = useCallback(() => {
    const a = pointARef.current;
    const b = pointBRef.current;
    setPointA(b);
    setPointB(a);
  }, []);

  // Derived status text for the mode indicator in the sidebar
  const modeText = useMemo<string | null>(() => {
    if (flashMsg) return flashMsg;
    if (!pointA) return 'Click the map to set your starting point';
    if (!pointB) return 'Now click to set your destination';
    return null;
  }, [pointA, pointB, flashMsg]);

  const activeRoute = routes[activeRouteIdx] ?? null;

  return (
    <div
      className="app"
      style={{
        '--sidebar-width':   `${sidebarWidth}px`,
        '--elevation-height': `${elevationHeight}px`,
      } as React.CSSProperties}
    >
      <Sidebar
        pointA={pointA}
        pointB={pointB}
        routes={routes}
        activeRouteIdx={activeRouteIdx}
        loading={loading}
        error={error}
        modeText={modeText}
        mobileSheetOpen={mobileSheetOpen}
        onSetPoint={handleSetPoint}
        onClearPoint={handleClearPoint}
        onSwapPoints={handleSwapPoints}
        onSelectRoute={(idx) => { setActiveRouteIdx(idx); setMobileSheetOpen(false); }}
        onMobileClose={() => setMobileSheetOpen(false)}
      />
      <div className="sidebar-resize-handle" onMouseDown={handleSidebarResizeStart} />
      {/* Mobile backdrop — tapping the map while the sheet is open closes it */}
      {mobileSheetOpen && (
        <div
          className="fixed inset-0 z-299 md:hidden"
          onClick={() => setMobileSheetOpen(false)}
        />
      )}
      {/* Mobile bottom controls — hidden on desktop and when sheet is open */}
      {!mobileSheetOpen && (
        <>
          {/* Route badge — shows active route name when routes are loaded */}
          {routes.length > 0 ? (
            <button
              onClick={() => setMobileSheetOpen(true)}
              className="fixed bottom-5 left-4 z-200 md:hidden flex items-center gap-2 bg-paper border border-line-soft rounded-full pl-2.5 pr-4 py-2 shadow-card cursor-pointer"
            >
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ background: routes[activeRouteIdx]?.color }}
              />
              <span className="font-mono text-[11px] tracking-[0.12em] text-ink">
                {routes[activeRouteIdx]?.name}
              </span>
            </button>
          ) : (
            /* Generic FAB — shown before any routes are loaded */
            <button
              onClick={() => setMobileSheetOpen(true)}
              className="fixed bottom-5 left-1/2 -translate-x-1/2 z-200 md:hidden bg-ink text-paper font-mono text-[11px] tracking-[0.15em] uppercase px-5 py-3 rounded-full shadow-card hover:bg-alpine transition-colors cursor-pointer flex items-center gap-2"
            >
              <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M1 4h14v1.5H1zm0 4h14v1.5H1zm0 4h9v1.5H1z"/></svg>
              Plan route
            </button>
          )}
        </>
      )}
      <MapView
        pointA={pointA}
        pointB={pointB}
        routes={routes}
        activeRouteIdx={activeRouteIdx}
        hoverLatLng={hoverLatLng}
        onMapClick={handleMapClick}
        onDragEnd={handleDragEnd}
        onRouteClick={setActiveRouteIdx}
      />
      <ElevationPanel
        route={activeRoute}
        onHoverChange={setHoverLatLng}
        onResizeStart={handleElevationResizeStart}
      />
    </div>
  );
}
