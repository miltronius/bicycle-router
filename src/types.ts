import type { TileLayerOptions } from 'leaflet';
import type { WaySegment, RouteSummary } from './lib/route';


export interface Point {
  lat: number;
  lng: number;
  name: string;
}

export interface Profile {
  key: string;
  name: string;
  emName: string;
  tag: string;
  color: string;
  soft: string;
  /** Fetched by default. */
  default?: boolean;
}

export interface ElevationPoint {
  distance: number;
  elevation: number;
  lat: number;
  lon: number;
}

export interface BRouterGeoJSON {
  features: [{
    geometry: {
      type: string;
      coordinates: number[][];
    };
    properties: {
      'track-length': string;
      'total-time': string;
      'filtered ascend'?: string;
      'plain-ascend'?: string;
      messages?: string[][];
    };
  }];
}

export interface Route extends Profile {
  data: BRouterGeoJSON;
  profilePoints: ElevationPoint[];
  /** Cumulative distance (m) at each geometry vertex. */
  cum: number[];
  /** OSM way-tag segments parsed from BRouter messages (for #11). */
  segments: WaySegment[];
  summary: RouteSummary;
  signature: string;
}

export interface TileProvider {
  id: string;
  name: string;
  url: string;
  opts: TileLayerOptions;
}

export interface HoverLatLng {
  lat: number;
  lon: number;
}
