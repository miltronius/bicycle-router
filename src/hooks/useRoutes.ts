import { useEffect, useState } from 'react';
import { PROFILES } from '../constants';
import { fetchRoute } from '../services/brouter';
import { buildElevationProfile, buildWaySegments, computeSignature, summarize } from '../lib/route';
import { cumulativeDistances } from '../lib/geo';
import type { BRouterGeoJSON, Point, Route } from '../types';

export function buildRoute(profileKey: string, data: BRouterGeoJSON): Route {
  const profile = PROFILES.find(p => p.key === profileKey) ?? PROFILES[0];
  const profilePoints = buildElevationProfile(data);
  return {
    ...profile,
    data,
    profilePoints,
    cum: cumulativeDistances(data.features[0].geometry.coordinates),
    segments: buildWaySegments(data),
    summary: summarize(data, profilePoints),
    signature: computeSignature(data),
  };
}

/**
 * Fetch one route per enabled profile whenever the (complete) waypoint list
 * changes. In-flight requests are aborted when inputs change.
 */
export function useRoutes(waypoints: (Point | null)[], profileKeys: string[]) {
  const [routes, setRoutes]   = useState<Route[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const complete = waypoints.every(Boolean) && waypoints.length >= 2;
  // Stable dependency key — re-fetch only when coordinates or profiles change, not names.
  const key = complete
    ? (waypoints as Point[]).map(w => `${w.lat.toFixed(6)},${w.lng.toFixed(6)}`).join('|') + '#' + profileKeys.join(',')
    : '';

  useEffect(() => {
    if (!key) {
      setRoutes([]);
      setError(null);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    const wps = waypoints as Point[];
    const keys = PROFILES.filter(p => profileKeys.includes(p.key)).map(p => p.key);
    setLoading(true);
    setError(null);
    setRoutes([]);

    Promise.allSettled(keys.map(k => fetchRoute(wps, k, ctrl.signal))).then(results => {
      if (ctrl.signal.aborted) return;
      const seen = new Set<string>();
      const out: Route[] = [];
      let firstErr: string | null = null;
      results.forEach((r, i) => {
        if (r.status === 'rejected') { firstErr ??= String((r.reason as Error)?.message ?? r.reason); return; }
        const route = buildRoute(keys[i], r.value);
        if (seen.has(route.signature)) return;   // duplicate track — drop silently
        seen.add(route.signature);
        out.push(route);
      });
      setLoading(false);
      if (out.length === 0) {
        setError(`Could not compute any route. Try moving points closer to a road.${firstErr ? ` (${firstErr})` : ''}`);
      } else {
        setRoutes(out);
      }
    });

    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` encodes waypoints + profiles
  }, [key]);

  return { routes, setRoutes, loading, error };
}
