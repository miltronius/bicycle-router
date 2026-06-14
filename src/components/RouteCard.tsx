import type { Route } from '../types';

interface Props {
  route:   Route;
  active:  boolean;
  onClick: () => void;
}

function downloadGPX(route: Route, e: React.MouseEvent) {
  e.stopPropagation();
  const coords = route.data.features[0].geometry.coordinates;
  const trkpts = coords.map(c =>
    `      <trkpt lat="${c[1]}" lon="${c[0]}"${c[2] !== undefined ? ` ele="${Math.round(c[2])}"` : ''} />`
  ).join('\n');
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="ZürichVelo" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${route.name} route</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
  const url = URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${route.key}-route.gpx` });
  a.click();
  URL.revokeObjectURL(url);
}

export default function RouteCard({ route, active, onClick }: Props) {
  const props   = route.data.features[0].properties;
  const lenKm    = (parseInt(props['track-length']) / 1000).toFixed(1);
  const totalMin = Math.round(parseInt(props['total-time']) / 60);
  const timeStr  = totalMin >= 60
    ? `${Math.floor(totalMin / 60)}:${String(totalMin % 60).padStart(2, '0')}`
    : String(totalMin);
  const timeUnit = totalMin >= 60 ? 'h' : 'min';
  const ascend   = parseInt(props['filtered ascend'] ?? props['plain-ascend'] ?? '0');

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
      className={`route-card cursor-pointer rounded-xl px-4 py-3.5 border transition-all duration-[180ms] ${
        active
          ? 'active bg-white shadow-card border-transparent'
          : 'bg-paper-2 border-transparent hover:bg-white hover:shadow-soft'
      }`}
      style={{ '--route-color': route.color, '--route-color-soft': route.soft } as React.CSSProperties}
    >
      <div className="flex justify-between items-baseline mb-1.5 pl-3">
        <span className="font-display text-[19px] font-medium tracking-tight">
          {route.name}{' '}
          <em className="italic font-normal" style={{ color: route.color }}>
            {route.emName}
          </em>
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className="font-mono text-[9px] tracking-[0.18em] uppercase px-1.5 py-0.5 rounded"
            style={{ color: route.color, background: route.soft }}
          >
            {route.tag}
          </span>
          <button
            onClick={e => downloadGPX(route, e)}
            title="Download GPX"
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-paper-3 transition-colors cursor-pointer text-ink-muted hover:text-ink"
          >
            <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
              <path d="M7.5 1v8.5L5 7H4l3.5 4 3.5-4H10L7.5 9.5V1h-1zM2 13h12v1H2z"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-2.5 pt-2.5 border-t border-line-soft pl-3">
        {([
          { value: lenKm,   unit: 'km',     label: 'distance' },
          { value: timeStr, unit: timeUnit, label: 'time'     },
          { value: ascend,  unit: 'm',      label: 'ascent'   },
        ] as const).map(({ value, unit, label }) => (
          <div key={label}>
            <div className="font-mono text-[15px] font-medium text-ink">
              {value}
              <span className="text-[10px] font-normal text-ink-muted ml-0.5">{unit}</span>
            </div>
            <div className="font-mono text-[9px] tracking-[0.15em] uppercase text-ink-muted mt-0.5">
              {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
