export function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));
}

export interface GpxWaypoint { lat: number; lng: number; name: string }

/**
 * Serialise a track to GPX 1.1.
 * `coords` are [lon, lat, ele?]; `times` (ms epoch, same length) are optional
 * and used for recorded rides.
 */
export function toGPX(name: string, coords: number[][], opts: { times?: number[]; waypoints?: GpxWaypoint[] } = {}): string {
  const { times, waypoints = [] } = opts;
  const wpts = waypoints.map(w =>
    `  <wpt lat="${w.lat}" lon="${w.lng}"><name>${escapeXml(w.name)}</name></wpt>`
  ).join('\n');
  const trkpts = coords.map((c, i) => {
    const ele = c[2] !== undefined && Number.isFinite(c[2]) ? `<ele>${Math.round(c[2] * 10) / 10}</ele>` : '';
    const time = times?.[i] !== undefined ? `<time>${new Date(times[i]).toISOString()}</time>` : '';
    return ele || time
      ? `      <trkpt lat="${c[1]}" lon="${c[0]}">${ele}${time}</trkpt>`
      : `      <trkpt lat="${c[1]}" lon="${c[0]}"/>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="ZürichVelo" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${escapeXml(name)}</name></metadata>
${wpts ? wpts + '\n' : ''}  <trk>
    <name>${escapeXml(name)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}

export function downloadText(filename: string, text: string, mime = 'application/gpx+xml'): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
