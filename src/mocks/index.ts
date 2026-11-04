// Dev-only mock API layer. Enabled with VITE_MOCK=1 (see `pnpm dev:mock`).
// Intercepts fetch() for BRouter, Photon, Nominatim, Overpass and Open-Meteo and
// returns deterministic synthetic data, so UI work and E2E tests don't depend
// on public services. Never bundled in production builds without VITE_MOCK.

type Json = Record<string, unknown>;

const WIGGLE: Record<string, number> = {
  fastbike: 0, 'fastbike-lowtraffic': 0.002, trekking: 0.004, 'trekking-nocar': 0.006, safety: 0.008,
  shortest: -0.002, gravel: 0.01, 'mtb-zossebart': 0.012,
};
const TAGS = [
  'highway=cycleway surface=asphalt lit=yes',
  'highway=residential maxspeed=30 surface=asphalt',
  'highway=primary maxspeed=50 railway=tram',
  'highway=track tracktype=grade2 surface=gravel',
  'highway=secondary cycleway:right=lane maxspeed=50 lit=yes',
];

export function mockRoute(lonlats: string, profile: string): Json {
  const pts = lonlats.split('|').map(s => s.split(',').map(Number));
  const w = WIGGLE[profile] ?? 0.003;
  const coords: number[][] = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const [a, b] = [pts[k], pts[k + 1]];
    const n = 60;
    for (let i = k === 0 ? 0 : 1; i <= n; i++) {
      const t = i / n;
      coords.push([
        a[0] + (b[0] - a[0]) * t + Math.sin(t * Math.PI) * w,
        a[1] + (b[1] - a[1]) * t + Math.sin(t * Math.PI) * w * 0.3,
        Math.round((410 + 120 * Math.sin(t * Math.PI) + 15 * Math.sin(t * 17 + k)) * 10) / 10,
      ]);
    }
  }
  const msgs: string[][] = [['Longitude', 'Latitude', 'Elevation', 'Distance', 'CostPerKm', 'ElevCost', 'TurnCost', 'NodeCost', 'InitialCost', 'WayTags', 'NodeTags', 'Time', 'Energy']];
  let len = 0;
  for (let i = 4; i < coords.length; i += 4) {
    const a = coords[i - 4], b = coords[i];
    const d = Math.hypot((b[0] - a[0]) * 75300, (b[1] - a[1]) * 111200);
    len += d;
    msgs.push([String(Math.round(b[0] * 1e6)), String(Math.round(b[1] * 1e6)), String(Math.round(b[2])), String(Math.round(d)),
      '1000', '0', '0', '0', '0', TAGS[(i / 4 + profile.length) % TAGS.length], '', '0', '0']);
  }
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: coords },
      properties: { 'track-length': String(Math.round(len)), 'total-time': String(Math.round(len / 5)), 'filtered ascend': '150', messages: msgs } }],
  };
}

function mockPois(query: string): Json {
  // Drop a few POIs near the first coordinates of the around() polyline
  const m = /around\.r:\d+,([\d.,-]+)\)/.exec(query);
  const nums = m ? m[1].split(',').map(Number) : [47.37, 8.53];
  const pairs: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pairs.push([nums[i], nums[i + 1]]);
  const pick = (f: number) => pairs[Math.min(pairs.length - 1, Math.floor(pairs.length * f))];
  const cats: [string, Record<string, string>][] = [
    ['water', { amenity: 'drinking_water', name: 'Brunnen' }],
    ['repair', { amenity: 'bicycle_repair_station' }],
    ['food', { amenity: 'cafe', name: 'Café Velo' }],
    ['water', { amenity: 'drinking_water' }],
    ['toilets', { amenity: 'toilets' }],
    ['viewpoint', { tourism: 'viewpoint', name: 'Aussichtspunkt' }],
  ];
  return {
    elements: cats.map(([, tags], i) => {
      const [lat, lon] = pick((i + 1) / (cats.length + 1));
      return { type: 'node', id: 1000 + i, lat: lat + 0.0005, lon: lon + 0.0005, tags };
    }),
  };
}

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

export function installMocks(): void {
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    await new Promise(r => setTimeout(r, 150));
    if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (url.pathname.includes('/brouter')) return json(mockRoute(url.searchParams.get('lonlats') ?? '', url.searchParams.get('profile') ?? ''));
    if (url.host.includes('photon')) {
      const q = url.searchParams.get('q') ?? '';
      return json({ features: [
        { geometry: { coordinates: [8.4918, 47.3497] }, properties: { name: `Uetliberg (${q})`, city: 'Stallikon', state: 'Zürich' } },
        { geometry: { coordinates: [8.5450, 47.3664] }, properties: { name: 'Bellevue', city: 'Zürich', state: 'Zürich' } },
        { geometry: { coordinates: [8.5480, 47.3769] }, properties: { name: 'ETH Zentrum', city: 'Zürich', state: 'Zürich' } },
      ] });
    }
    if (url.host.includes('nominatim')) return json({ address: { road: 'Mockstrasse', city: 'Zürich' }, display_name: 'Mockstrasse, Zürich' });
    if (url.pathname.includes('/interpreter')) {
      const body = init?.body instanceof URLSearchParams ? init.body.get('data') ?? '' : String(init?.body ?? '');
      return json(mockPois(body));
    }
    if (url.host.includes('open-meteo')) {
      return json({ current: { wind_speed_10m: 18, wind_direction_10m: 225, temperature_2m: 14, precipitation: 0, weather_code: 2 } });
    }
    return real(input, init);
  };
  console.info('[ZürichVelo] Mock APIs enabled (VITE_MOCK=1)');
}
