import { useMemo } from 'react';
import type { Route, Point } from '../types';
import type { PaceMode } from '../App';
import { estimateRide, BIKES } from '../lib/physics';
import type { RiderSettings } from '../lib/physics';
import { toGPX, downloadText } from '../lib/gpx';
import { formatDuration } from '../lib/geo';
import { classifySafety, shareBy, SAFETY_COLORS, SAFETY_LABELS, SAFETY_ORDER } from '../lib/safety';

interface Props {
  route:     Route;
  active:    boolean;
  rider:     RiderSettings;
  paceMode:  PaceMode;
  waypoints: Point[];
  onClick:   () => void;
  onRide:    () => void;
}

export default function RouteCard({ route, active, rider, paceMode, waypoints, onClick, onRide }: Props) {
  const s   = route.summary;
  const est = useMemo(() => estimateRide(route.profilePoints, rider), [route.profilePoints, rider]);
  const safety = useMemo(() => shareBy(route.segments, classifySafety, SAFETY_ORDER), [route.segments]);
  const isE = BIKES[rider.bike].motorW > 0;

  const timeS = paceMode === 'mine' && est.timeS > 0 ? est.timeS : s.timeS;
  const [timeVal, timeUnit] = formatDuration(timeS).split(' ');
  const avgKmh = timeS > 0 ? (s.lengthM / timeS) * 3.6 : 0;

  const handleGPX = (e: React.MouseEvent) => {
    e.stopPropagation();
    const gpx = toGPX(`ZürichVelo · ${route.name}`, route.data.features[0].geometry.coordinates, {
      waypoints: waypoints.map((w, i) => ({ ...w, name: `${String.fromCharCode(65 + i)} · ${w.name}` })),
    });
    downloadText(`zurichvelo-${route.key}.gpx`, gpx);
  };

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-pressed={active}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
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
          <em className="italic font-normal" style={{ color: route.color }}>{route.emName}</em>
        </span>
        <div className="flex items-center gap-1">
          <span
            className="font-mono text-[9px] tracking-[0.18em] uppercase px-1.5 py-0.5 rounded"
            style={{ color: route.color, background: route.soft }}
          >
            {route.tag}
          </span>
          <button
            onClick={handleGPX}
            title="Download GPX"
            aria-label={`Download ${route.name} route as GPX`}
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
          { value: (s.lengthM / 1000).toFixed(1), unit: 'km', label: 'distance' },
          { value: timeVal, unit: timeUnit, label: paceMode === 'mine' ? 'your pace' : 'time' },
          { value: s.ascentM, unit: 'm', label: 'ascent' },
        ] as const).map(({ value, unit, label }) => (
          <div key={label}>
            <div className="font-mono text-[15px] font-medium text-ink">
              {value}
              <span className="text-[10px] font-normal text-ink-muted ml-0.5">{unit}</span>
            </div>
            <div className="font-mono text-[9px] tracking-[0.15em] uppercase text-ink-muted mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Pace / power / battery (#4, #5) */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 pl-3 font-mono text-[10.5px] text-ink-soft">
        <span title="Average speed">Ø {avgKmh.toFixed(1)} km/h</span>
        <span title="Average rider power at your settings">⚡ {Math.round(est.avgRiderW)} W</span>
        <span title="Estimated energy burned">🔥 {Math.round(est.kcal)} kcal</span>
        {isE && (
          <span
            title={`Estimated battery use: ${Math.round(est.batteryWh)} Wh of ${rider.batteryWh} Wh`}
            className={est.batteryPct > 100 ? 'text-alpine font-semibold' : est.batteryPct > 80 ? 'text-[#b7791f]' : ''}
          >
            🔋 {Math.round(est.batteryPct)}%{est.batteryPct > 100 ? ' ⚠' : ''}
          </span>
        )}
      </div>

      {/* Safety share bar (#11) */}
      {safety.length > 0 && (
        <div className="mt-2 pl-3">
          <div className="flex h-1.5 rounded-full overflow-hidden bg-paper-3" aria-label="Traffic exposure along the route">
            {safety.map(c => (
              <div key={c.cls} style={{ width: `${c.pct}%`, background: SAFETY_COLORS[c.cls] }} title={`${SAFETY_LABELS[c.cls]}: ${Math.round(c.pct)}%`} />
            ))}
          </div>
          <div className="flex gap-2 mt-1 font-mono text-[9px] text-ink-muted">
            {safety.filter(c => c.cls !== 'unknown').map(c => (
              <span key={c.cls}>
                <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle" style={{ background: SAFETY_COLORS[c.cls] }} />
                {Math.round(c.pct)}% {c.cls}
              </span>
            ))}
          </div>
        </div>
      )}

      {active && (
        <button
          onClick={e => { e.stopPropagation(); onRide(); }}
          className="mt-3 ml-3 w-[calc(100%-0.75rem)] py-2 rounded-lg font-mono text-[11px] tracking-[0.15em] uppercase text-paper cursor-pointer transition-opacity hover:opacity-90"
          style={{ background: route.color }}
        >
          ▶ Start ride
        </button>
      )}
    </div>
  );
}
