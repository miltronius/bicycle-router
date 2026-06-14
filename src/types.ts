import type { TileLayerOptions } from 'leaflet';

export type PointKey = 'a' | 'b';

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
