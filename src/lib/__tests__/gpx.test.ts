import { describe, it, expect } from 'vitest';
import { toGPX, escapeXml } from '../gpx';

describe('gpx', () => {
  it('escapes XML', () => expect(escapeXml(`a<b>&"'`)).toBe('a&lt;b&gt;&amp;&quot;&apos;'));
  it('writes track points with elevation and optional time', () => {
    const g = toGPX('Test & co', [[8.5, 47.3, 410.26], [8.6, 47.4]], { times: [0, 1000], waypoints: [{ lat: 47.3, lng: 8.5, name: 'A' }] });
    expect(g).toContain('<name>Test &amp; co</name>');
    expect(g).toContain('<trkpt lat="47.3" lon="8.5"><ele>410.3</ele><time>1970-01-01T00:00:00.000Z</time></trkpt>');
    expect(g).toContain('<trkpt lat="47.4" lon="8.6"><time>1970-01-01T00:00:01.000Z</time></trkpt>');
    expect(g).toContain('<wpt lat="47.3" lon="8.5"><name>A</name></wpt>');
  });
});
