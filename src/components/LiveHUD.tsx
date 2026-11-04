import { useMemo } from 'react';
import type { Route } from '../types';
import type { TrackerState } from '../lib/live';
import { findClimbs, remainingAscent } from '../lib/live';
import { estimateRide } from '../lib/physics';
import type { RiderSettings } from '../lib/physics';
import type { GeoFix } from '../hooks/useGeolocation';
import type { PoiOnRoute } from '../App';
import { POI_BY_ID } from '../lib/poi';
import type { Poi, PoiCategory } from '../lib/poi';
import { formatDistance } from '../lib/geo';

interface Props {
  route: Route;
  tracker: TrackerState;
  fix: GeoFix | null;
  rider: RiderSettings;
  pois: PoiOnRoute[];
  rerouting: boolean;
  poiCats: PoiCategory[];
  onPoiCatsChange: (c: PoiCategory[]) => void;
  onAddPoi: (p: Poi) => void;
  onStop: () => void;
  onRecenter: () => void;
}

const QUICK: PoiCategory[] = ['water', 'repair', 'food', 'toilets', 'charging', 'shop'];

export default function LiveHUD({ route, tracker, fix, rider, pois, rerouting, poiCats, onPoiCatsChange, onAddPoi, onStop, onRecenter }: Props) {
  const total = route.cum[route.cum.length - 1] ?? route.summary.lengthM;
  const remaining = Math.max(0, total - tracker.distAlong);
  const climbs = useMemo(() => findClimbs(route.profilePoints), [route.profilePoints]);
  const est = useMemo(() => estimateRide(route.profilePoints, rider), [route.profilePoints, rider]);

  const speedKmh = fix?.speed != null ? fix.speed * 3.6 : null;
  // ETA: blend the model with the rider's actual moving average once they've ridden a bit
  const modelKmh = est.avgKmh || 18;
  const actualKmh = tracker.movingMs > 60000 ? (tracker.ridden / (tracker.movingMs / 1000)) * 3.6 : null;
  const etaKmh = actualKmh ? 0.6 * actualKmh + 0.4 * modelKmh : modelKmh;
  const etaSec = remaining / (etaKmh / 3.6);
  const eta = new Date(Date.now() + etaSec * 1000);
  const climbLeft = remainingAscent(route.profilePoints, tracker.distAlong);

  const nextClimb = climbs.find(c => c.end > tracker.distAlong);
  const ahead = pois.filter(p => p.distAlong > tracker.distAlong - 20);
  const offRoute = tracker.offRouteSince !== null;

  const toggleCat = (c: PoiCategory) => {
    if (!poiCats.includes(c)) onPoiCatsChange([...poiCats, c]);
  };

  return (
    <div className="live-hud fixed z-[700] left-2 right-2 bottom-2 md:bottom-auto md:top-3 md:left-auto md:right-3 md:w-[380px]">
      <div className="bg-ink text-paper rounded-2xl shadow-card p-3.5">
        {offRoute && (
          <div className="mb-2 px-2.5 py-1.5 rounded-md bg-alpine text-paper font-mono text-[11px] tracking-wide">
            {rerouting ? '⟳ Recalculating route…' : `⚠ Off route · ${Math.round(tracker.offset)} m away`}
          </div>
        )}
        <div className="grid grid-cols-4 gap-2 text-center">
          <Stat value={speedKmh !== null ? speedKmh.toFixed(0) : '–'} unit="km/h" label="speed" big />
          <Stat value={formatDistance(remaining).split(' ')[0]} unit={formatDistance(remaining).split(' ')[1]} label="to go" big />
          <Stat value={eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} unit="" label="arrive" big />
          <Stat value={String(Math.round(climbLeft))} unit="m ↑" label="climb left" big />
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 bg-[rgba(255,255,255,0.15)] rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (tracker.distAlong / (total || 1)) * 100)}%`, background: route.color }} />
        </div>

        {/* Next notable */}
        <div className="mt-2.5 flex flex-col gap-1 font-mono text-[11px] text-[rgba(244,239,230,0.85)]">
          {nextClimb && (
            <div>
              ⛰ {nextClimb.start > tracker.distAlong
                ? `Climb in ${formatDistance(nextClimb.start - tracker.distAlong)}: `
                : 'Climbing: '}
              {formatDistance(nextClimb.end - nextClimb.start)} at {(nextClimb.avgGrade * 100).toFixed(0)}% (+{Math.round(nextClimb.gain)} m)
            </div>
          )}
          {ahead.slice(0, 2).map(p => (
            <div key={p.id} className="flex items-center gap-2">
              <span className="flex-1 truncate">{POI_BY_ID[p.category].icon} {p.name} in {formatDistance(Math.max(0, p.distAlong - tracker.distAlong))}</span>
              <button onClick={() => onAddPoi(p)} className="px-1.5 py-0.5 rounded border border-[rgba(244,239,230,0.3)] hover:bg-paper hover:text-ink cursor-pointer">+ stop</button>
            </div>
          ))}
        </div>

        {/* Find closest (#10) */}
        <div className="mt-2.5 flex flex-wrap gap-1">
          {QUICK.map(c => {
            const next = ahead.find(p => p.category === c);
            return (
              <button
                key={c}
                onClick={() => (next ? onAddPoi(next) : toggleCat(c))}
                title={next ? `Add ${next.name} as a stop` : `Search for ${POI_BY_ID[c].label}`}
                className="font-mono text-[10px] px-2 py-1 rounded-full bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.2)] cursor-pointer"
              >
                {POI_BY_ID[c].icon} {next ? formatDistance(next.distAlong - tracker.distAlong) : poiCats.includes(c) ? '—' : 'find'}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex gap-2">
          <button onClick={onRecenter} className="flex-1 py-2 rounded-lg bg-[rgba(255,255,255,0.12)] font-mono text-[11px] uppercase tracking-[0.12em] cursor-pointer">◎ Recenter</button>
          <button onClick={onStop} className="flex-1 py-2 rounded-lg bg-alpine font-mono text-[11px] uppercase tracking-[0.12em] cursor-pointer">■ End ride</button>
        </div>
        {!fix && <p className="mt-2 font-mono text-[10px] text-[rgba(244,239,230,0.7)]">Waiting for GPS… (allow location access)</p>}
      </div>
    </div>
  );
}

function Stat({ value, unit, label, big }: { value: string; unit: string; label: string; big?: boolean }) {
  return (
    <div>
      <div className={`font-mono ${big ? 'text-[20px]' : 'text-[15px]'} font-medium leading-tight`}>
        {value}<span className="text-[10px] font-normal opacity-70 ml-0.5">{unit}</span>
      </div>
      <div className="font-mono text-[8.5px] tracking-[0.15em] uppercase opacity-60">{label}</div>
    </div>
  );
}
