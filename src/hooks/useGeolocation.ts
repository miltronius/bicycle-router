import { useEffect, useState } from 'react';

export interface GeoFix {
  lat: number;
  lng: number;
  accuracy: number;
  /** Degrees clockwise from north; null when unknown / stationary. */
  heading: number | null;
  /** m/s; null when unknown. */
  speed: number | null;
  timestamp: number;
}

/**
 * Watch the device position while `enabled`. Fixes worse than `maxAccuracy`
 * metres are ignored once a good fix has been received (GPS warm-up jitter).
 */
export function useGeolocation(enabled: boolean, maxAccuracy = 60) {
  const [fix, setFix]     = useState<GeoFix | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!('geolocation' in navigator)) { setError('Geolocation is not supported by this browser.'); return; }
    setError(null);
    let hadGood = false;
    const id = navigator.geolocation.watchPosition(
      pos => {
        const c = pos.coords;
        if (hadGood && c.accuracy > maxAccuracy) return;
        if (c.accuracy <= maxAccuracy) hadGood = true;
        setError(null);
        setFix({
          lat: c.latitude, lng: c.longitude, accuracy: c.accuracy,
          heading: c.heading !== null && !Number.isNaN(c.heading) ? c.heading : null,
          speed: c.speed !== null && !Number.isNaN(c.speed) ? c.speed : null,
          timestamp: pos.timestamp,
        });
      },
      err => setError(
        err.code === err.PERMISSION_DENIED ? 'Location permission denied. Enable it in your browser settings.'
        : err.code === err.TIMEOUT ? 'Getting your location timed out.'
        : 'Your location is unavailable.'),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled, maxAccuracy]);

  return { fix: enabled ? fix : null, error: enabled ? error : null };
}
