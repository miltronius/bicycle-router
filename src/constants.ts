import type { Profile, TileProvider } from './types';

// --- Geographic bounds — all of Switzerland ---
export const INITIAL_CENTER: [number, number] = [46.80, 8.23]; // approx centre of Switzerland
export const INITIAL_ZOOM = 8;
export const BOUNDS_SW: [number, number] = [45.82, 5.95];   // SW corner (Geneva / Valais)
export const BOUNDS_NE: [number, number] = [47.81, 10.49];  // NE corner (Schaffhausen / Graubünden)
export const NOMINATIM_VIEWBOX = '5.95,47.81,10.49,45.82';  // lon_min,lat_max,lon_max,lat_min
export const PHOTON_BBOX = '5.95,45.82,10.49,47.81';        // lon_min,lat_min,lon_max,lat_max

// --- Routing profiles ---
// `default: true` profiles are fetched unless the user changes the selection in
// the profile picker. Extra profiles are brouter.de standard profiles; if one is
// unavailable on the server it is silently dropped like any failed request.
export const PROFILES: Profile[] = [
  { key: 'fastbike',            name: 'Fastest',     emName: 'route',  tag: 'speed',   color: '#d97706', soft: 'rgba(217,119,6,0.12)',   default: true },
  { key: 'fastbike-lowtraffic', name: 'Low Traffic', emName: 'route',  tag: 'quiet',   color: '#7e3f8f', soft: 'rgba(126,63,143,0.12)',  default: true },
  { key: 'trekking',            name: 'Balanced',    emName: 'mix',    tag: 'mixed',   color: '#2c5f7c', soft: 'rgba(44,95,124,0.12)',   default: true },
  { key: 'trekking-nocar',      name: 'Car-free',    emName: 'paths',  tag: 'no-car',  color: '#2a7a6e', soft: 'rgba(42,122,110,0.12)',  default: true },
  { key: 'safety',              name: 'Safety',      emName: 'paths',  tag: 'safety',  color: '#4a6741', soft: 'rgba(74,103,65,0.12)',   default: true },
  { key: 'shortest',            name: 'Shortest',    emName: 'line',   tag: 'short',   color: '#5b5f97', soft: 'rgba(91,95,151,0.12)' },
  { key: 'gravel',              name: 'Gravel',      emName: 'track',  tag: 'gravel',  color: '#a0522d', soft: 'rgba(160,82,45,0.12)' },
  { key: 'mtb-zossebart',       name: 'MTB',         emName: 'trail',  tag: 'mtb',     color: '#556b2f', soft: 'rgba(85,107,47,0.12)' },
];

export const DEFAULT_PROFILE_KEYS = PROFILES.filter(p => p.default).map(p => p.key);

// --- Optional tile API keys ---
// Set in .env.local (see .env.example) — never commit real keys.
export const API_KEYS = {
  thunderforest: (import.meta.env.VITE_THUNDERFOREST_KEY as string | undefined) ?? '', // 150k tiles/mo
  maptiler:      (import.meta.env.VITE_MAPTILER_KEY as string | undefined) ?? '',      // 100k tiles/mo
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
    { id: 'swisstopo', name: 'swisstopo Landeskarte',
      url: 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg',
      opts: { maxZoom: 19, maxNativeZoom: 18, attribution: '&copy; <a href="https://www.swisstopo.admin.ch/">swisstopo</a>' } },
    { id: 'cyclosm', name: 'CyclOSM (bike-aware)',
      url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
      opts: { subdomains: 'abc', maxZoom: 20, attribution: '<a href="https://www.cyclosm.org">CyclOSM</a> | &copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>' } },
    { id: 'swissimage', name: 'swisstopo Aerial',
      url: 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg',
      opts: { maxZoom: 20, maxNativeZoom: 19, attribution: '&copy; <a href="https://www.swisstopo.admin.ch/">swisstopo</a>' } },
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

// --- Transparent overlays (bike networks etc.) ---
export interface OverlayDef { id: string; name: string; url: string; opts: TileProvider['opts'] }

export const OVERLAYS: OverlayDef[] = [
  { id: 'veloland', name: 'SchweizMobil cycling routes',
    url: 'https://wmts.geo.admin.ch/1.0.0/ch.astra.veloland/default/current/3857/{z}/{x}/{y}.png',
    opts: { maxZoom: 19, maxNativeZoom: 18, opacity: 0.85, attribution: 'Veloland &copy; ASTRA / SchweizMobil' } },
  { id: 'mtbland', name: 'SchweizMobil MTB routes',
    url: 'https://wmts.geo.admin.ch/1.0.0/ch.astra.mountainbikeland/default/current/3857/{z}/{x}/{y}.png',
    opts: { maxZoom: 19, maxNativeZoom: 18, opacity: 0.85, attribution: 'Mountainbikeland &copy; ASTRA / SchweizMobil' } },
  { id: 'waymarked', name: 'Waymarked cycling (OSM)',
    url: 'https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png',
    opts: { maxZoom: 18, opacity: 0.8, attribution: '&copy; <a href="https://cycling.waymarkedtrails.org">Waymarked Trails</a>' } },
];
