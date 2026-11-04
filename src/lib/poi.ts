// Points of interest along a route (#10) via the Overpass API.

export type PoiCategory =
  | 'water' | 'repair' | 'charging' | 'parking' | 'rental'
  | 'toilets' | 'food' | 'shop' | 'fuel' | 'hotel' | 'station' | 'viewpoint';

export interface PoiCategoryDef {
  id: PoiCategory;
  label: string;
  icon: string;
  /** Overpass QL tag filters (each becomes one nwr[...] selector). */
  filters: string[];
  /** Enabled by default. */
  default?: boolean;
}

export const POI_CATEGORIES: PoiCategoryDef[] = [
  { id: 'water',    label: 'Drinking water', icon: '💧', default: true,
    filters: ['["amenity"="drinking_water"]', '["amenity"="fountain"]["drinking_water"="yes"]', '["man_made"="water_tap"]["drinking_water"="yes"]'] },
  { id: 'repair',   label: 'Bike repair',    icon: '🔧', default: true,
    filters: ['["amenity"="bicycle_repair_station"]', '["shop"="bicycle"]'] },
  { id: 'charging', label: 'E-bike charging', icon: '🔌',
    filters: ['["amenity"="charging_station"]["bicycle"="yes"]', '["amenity"="charging_station"]["bicycle"="designated"]'] },
  { id: 'parking',  label: 'Bike parking',   icon: '🅿️',
    filters: ['["amenity"="bicycle_parking"]["covered"="yes"]'] },
  { id: 'rental',   label: 'Bike sharing',   icon: '🚲',
    filters: ['["amenity"="bicycle_rental"]'] },
  { id: 'toilets',  label: 'Toilets',        icon: '🚻',
    filters: ['["amenity"="toilets"]'] },
  { id: 'food',     label: 'Café / food',    icon: '☕',
    filters: ['["amenity"~"^(cafe|restaurant|fast_food|biergarten|ice_cream)$"]'] },
  { id: 'shop',     label: 'Groceries',      icon: '🛒',
    filters: ['["shop"~"^(supermarket|convenience|bakery)$"]'] },
  { id: 'fuel',     label: 'Gas station',    icon: '⛽',
    filters: ['["amenity"="fuel"]'] },
  { id: 'hotel',    label: 'Hotels',         icon: '🏨',
    filters: ['["tourism"~"^(hotel|guest_house|hostel|camp_site)$"]'] },
  { id: 'station',  label: 'Train station',  icon: '🚆',
    filters: ['["railway"="station"]["station"!="subway"]'] },
  { id: 'viewpoint', label: 'Viewpoints',    icon: '🏔️',
    filters: ['["tourism"="viewpoint"]'] },
];

export const POI_BY_ID: Record<PoiCategory, PoiCategoryDef> =
  Object.fromEntries(POI_CATEGORIES.map(c => [c.id, c])) as Record<PoiCategory, PoiCategoryDef>;

export interface Poi {
  id: string;
  lat: number;
  lng: number;
  category: PoiCategory;
  name: string;
  tags: Record<string, string>;
}

/**
 * Build an Overpass QL query for POIs within `radius` metres of a polyline.
 * `line` is [lon, lat][] — pass a simplified line (≈100–200 vertices) to keep
 * the query small.
 */
export function buildOverpassQuery(line: number[][], categories: PoiCategory[], radius = 150): string {
  const ll = line.map(c => `${c[1].toFixed(5)},${c[0].toFixed(5)}`).join(',');
  const sel = categories.flatMap(id => POI_BY_ID[id].filters.map(f => `  nwr${f}(around.r:${radius},${ll});`));
  return `[out:json][timeout:25];\n(\n${sel.join('\n')}\n);\nout center tags 500;`;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Which category does a tag set belong to? First match wins (category order). */
export function categorize(tags: Record<string, string>, wanted: PoiCategory[]): PoiCategory | null {
  for (const id of wanted) {
    for (const f of POI_BY_ID[id].filters) if (matchesFilter(tags, f)) return id;
  }
  return null;
}

/** Minimal evaluator for the Overpass filter subset used in POI_CATEGORIES. */
export function matchesFilter(tags: Record<string, string>, filter: string): boolean {
  const re = /\["([^"]+)"(=|!=|~)"([^"]*)"\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(filter))) {
    const [, k, op, v] = m;
    const val = tags[k];
    if (op === '=' && val !== v) return false;
    if (op === '!=' && val === v) return false;
    if (op === '~' && (val === undefined || !new RegExp(v).test(val))) return false;
  }
  return true;
}

export function parseOverpass(json: { elements?: OverpassElement[] }, wanted: PoiCategory[]): Poi[] {
  const out: Poi[] = [];
  for (const el of json.elements ?? []) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    const tags = el.tags ?? {};
    if (lat === undefined || lng === undefined) continue;
    if (tags.drinking_water === 'no' || tags.access === 'private' || tags.disused === 'yes') continue;
    const category = categorize(tags, wanted);
    if (!category) continue;
    out.push({
      id: `${el.type}/${el.id}`,
      lat, lng, category, tags,
      name: tags.name ?? tags.brand ?? tags.operator ?? POI_BY_ID[category].label,
    });
  }
  return out;
}
