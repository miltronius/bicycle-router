import type { Profile, TileProvider, BRouterGeoJSON, ElevationPoint } from './types';

// --- Geographic bounds — all of Switzerland ---
export const INITIAL_CENTER: [number, number] = [46.80, 8.23]; // approx centre of Switzerland
export const INITIAL_ZOOM = 8;
export const BOUNDS_SW: [number, number] = [45.82, 5.95];   // SW corner (Geneva / Valais)
export const BOUNDS_NE: [number, number] = [47.81, 10.49];  // NE corner (Schaffhausen / Graubünden)
export const NOMINATIM_VIEWBOX = '5.95,47.81,10.49,45.82';  // lon_min,lat_max,lon_max,lat_min

// --- Routing profiles ---
export const PROFILES: Profile[] = [
  { key: 'fastbike',          name: 'Fastest',     emName: 'route',  tag: 'speed',    color: '#d97706', soft: 'rgba(217,119,6,0.12)'   },
  { key: 'fastbike-lowtraffic', name: 'Low Traffic', emName: 'route', tag: 'quiet',   color: '#7e3f8f', soft: 'rgba(126,63,143,0.12)'  },
  { key: 'trekking',          name: 'Balanced',    emName: 'mix',    tag: 'mixed',    color: '#2c5f7c', soft: 'rgba(44,95,124,0.12)'   },
  { key: 'trekking-nocar',    name: 'Car-free',    emName: 'paths',  tag: 'no-car',   color: '#2a7a6e', soft: 'rgba(42,122,110,0.12)'  },
  { key: 'safety',            name: 'Safety',      emName: 'paths',  tag: 'safety',   color: '#4a6741', soft: 'rgba(74,103,65,0.12)'   },
];

// --- Optional tile API keys ---
export const API_KEYS = {
  thunderforest: '', // paste free key from thunderforest.com — 150k tiles/mo
  maptiler:      '', // paste free key from maptiler.com — 100k tiles/mo
};

// --- Tile provider list (keyed providers first, then keyless fallbacks) ---
export function buildTileProviders(keys: typeof API_KEYS): TileProvider[] {
  return [
    ...(keys.thunderforest ? [
      { id: 'opencyclemap', name: 'OpenCycleMap (bike-aware)',
        url: `https://{s}.tile.thunderforest.com/cycle/{z}/{x}/{y}.png?apikey=${keys.thunderforest}`,
        opts: { subdomains: 'abc', maxZoom: 22, attribution: 'Maps &copy; <a href="https://www.thunderforest.com/">Thunderforest</a>, Data &copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>' } },
      { id: 'thunderforest-outdoors', name: 'Thunderforest Outdoors',
        url: `https://{s}.tile.thunderforest.com/outdoors/{z}/{x}/{y}.png?apikey=${keys.thunderforest}`,
        opts: { subdomains: 'abc', maxZoom: 22, attribution: 'Maps &copy; <a href="https://www.thunderforest.com/">Thunderforest</a>' } },
    ] : []),
    ...(keys.maptiler ? [
      { id: 'maptiler-outdoor', name: 'MapTiler Outdoor',
        url: `https://api.maptiler.com/maps/outdoor-v2/{z}/{x}/{y}.png?key=${keys.maptiler}`,
        opts: { maxZoom: 19, attribution: '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>' } },
    ] : []),
    { id: 'esri-topo', name: 'ESRI Topo',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
      opts: { maxZoom: 19, attribution: 'Tiles &copy; Esri &mdash; OpenStreetMap contributors' } },
    { id: 'osm-de', name: 'OSM Germany',
      url: 'https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png',
      opts: { subdomains: 'abc', maxZoom: 18, attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>' } },
    { id: 'carto', name: 'CARTO Voyager',
      url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      opts: { subdomains: 'abcd', maxZoom: 19, attribution: '&copy; OSM &copy; CARTO' } },
    { id: 'opentopomap', name: 'OpenTopoMap',
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      opts: { subdomains: 'abc', maxZoom: 17, attribution: 'Map data: &copy; OpenStreetMap | Style: &copy; OpenTopoMap (CC-BY-SA)' } },
    { id: 'osm', name: 'OSM Standard',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      opts: { maxZoom: 19, attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>' } },
  ];
}

// --- Pre-loaded route for today: Zürich → Affoltern am Albis ---
// Using road-adjacent coordinates so BRouter can snap to a cycle route.
// HB front square (Bahnhofplatz road) rather than inside the station building.
export const DEFAULT_POINT_A = { lat: 47.3773, lng: 8.5374, name: 'Zürich Bahnhofplatz' };
export const DEFAULT_POINT_B = { lat: 47.2752, lng: 8.4528, name: 'Affoltern am Albis' };

// --- Utility: haversine distance in metres between [lon, lat] pairs ---
export function haversine(a: number[], b: number[]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(toRad(a[1])) * Math.cos(toRad(b[1]));
  return R * 2 * Math.asin(Math.sqrt(x));
}

// --- Utility: build elevation profile from BRouter GeoJSON ---
export function buildElevationProfile(geojson: BRouterGeoJSON): ElevationPoint[] {
  const props = geojson.features[0].properties;
  const messages = props.messages;

  if (messages && Array.isArray(messages) && messages.length > 1) {
    const headers = messages[0];
    const lonI  = headers.indexOf('Longitude');
    const latI  = headers.indexOf('Latitude');
    const eleI  = headers.indexOf('Elevation');
    const distI = headers.indexOf('Distance');
    if (lonI >= 0 && latI >= 0 && eleI >= 0 && distI >= 0) {
      // BRouter messages start at the first decision point, not the route origin.
      // Prepend the actual start coordinate (distance = 0) from the GeoJSON geometry.
      const c0 = geojson.features[0].geometry.coordinates[0];
      const start: ElevationPoint = {
        distance:  0,
        elevation: c0?.[2] ?? parseFloat(messages[1][eleI]),
        lat:       c0?.[1] ?? parseInt(messages[1][latI]) / 1e6,
        lon:       c0?.[0] ?? parseInt(messages[1][lonI]) / 1e6,
      };
      let cum = 0;
      const rest = messages.slice(1).map(row => {
        cum += parseFloat(row[distI]) || 0;
        return {
          distance:  cum,
          elevation: parseFloat(row[eleI]),
          lat:       parseInt(row[latI]) / 1e6,
          lon:       parseInt(row[lonI]) / 1e6,
        };
      });
      return [start, ...rest];
    }
  }

  const coords = geojson.features[0].geometry.coordinates;
  if (coords[0].length >= 3) {
    let cum = 0;
    const profile: ElevationPoint[] = [{ distance: 0, elevation: coords[0][2], lat: coords[0][1], lon: coords[0][0] }];
    for (let i = 1; i < coords.length; i++) {
      cum += haversine(coords[i - 1], coords[i]);
      profile.push({ distance: cum, elevation: coords[i][2], lat: coords[i][1], lon: coords[i][0] });
    }
    return profile;
  }
  return [];
}

// --- Utility: compute a short signature to detect duplicate routes ---
export function computeSignature(geojson: BRouterGeoJSON): string {
  const c   = geojson.features[0].geometry.coordinates;
  const len = geojson.features[0].properties['track-length'];
  const sample = [0, Math.floor(c.length / 4), Math.floor(c.length / 2), Math.floor(3 * c.length / 4), c.length - 1]
    .map(i => c[i] ? `${c[i][0].toFixed(4)},${c[i][1].toFixed(4)}` : '')
    .join('|');
  return `${len}|${sample}`;
}
