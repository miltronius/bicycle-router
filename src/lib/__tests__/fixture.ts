import type { BRouterGeoJSON } from '../../types';

// Synthetic BRouter-style response: ~2 km due north from Zürich HB with a 40 m climb.
// Shape mirrors brouter.de's GeoJSON (coordinates [lon, lat, ele], messages table with WayTags).
const lat0 = 47.3773, lon0 = 8.5374;
export const coords: number[][] = Array.from({ length: 21 }, (_, i) => [lon0, lat0 + i * 0.0009, 410 + (i <= 10 ? i * 4 : 40)]);

export const fixture: BRouterGeoJSON = {
  features: [{
    geometry: { type: 'LineString', coordinates: coords },
    properties: {
      'track-length': '2002',
      'total-time': '480',
      'filtered ascend': '40',
      messages: [
        ['Longitude', 'Latitude', 'Elevation', 'Distance', 'CostPerKm', 'ElevCost', 'TurnCost', 'NodeCost', 'InitialCost', 'WayTags', 'NodeTags', 'Time', 'Energy'],
        [String(Math.round(lon0 * 1e6)), String(Math.round((lat0 + 0.0045) * 1e6)), '430', '500', '1000', '0', '0', '0', '0', 'highway=cycleway surface=asphalt', '', '100', '0'],
        [String(Math.round(lon0 * 1e6)), String(Math.round((lat0 + 0.009) * 1e6)), '450', '500', '1000', '0', '0', '0', '0', 'highway=primary maxspeed=50', '', '200', '0'],
        [String(Math.round(lon0 * 1e6)), String(Math.round((lat0 + 0.018) * 1e6)), '450', '1002', '1000', '0', '0', '0', '0', 'highway=track tracktype=grade2', '', '480', '0'],
      ],
    },
  }],
};
