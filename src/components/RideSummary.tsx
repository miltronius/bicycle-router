import type { TrackerState } from '../lib/live';
import { toGPX, downloadText } from '../lib/gpx';
import { formatDuration } from '../lib/geo';

interface Props { tracker: TrackerState; routeName: string; onClose: () => void }

export default function RideSummary({ tracker, routeName, onClose }: Props) {
  const km = tracker.ridden / 1000;
  const sec = tracker.movingMs / 1000;
  const avg = sec > 0 ? km / (sec / 3600) : 0;
  const save = () => {
    const stamp = new Date(tracker.times[0] ?? Date.now()).toISOString().slice(0, 16).replace(/[:T]/g, '-');
    downloadText(`zurichvelo-ride-${stamp}.gpx`, toGPX(`Ride · ${routeName}`, tracker.track, { times: tracker.times }));
  };
  return (
    <div className="fixed inset-0 z-[800] flex items-center justify-center bg-[rgba(28,31,38,0.35)] p-4" onClick={onClose}>
      <div className="bg-paper rounded-2xl shadow-card p-6 w-full max-w-sm" onClick={e => e.stopPropagation()} role="dialog" aria-label="Ride summary">
        <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-muted mb-1">Ride finished</div>
        <h3 className="font-display text-[24px] tracking-tight mb-4">Nice <em className="italic text-alpine">ride</em>.</h3>
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            [km.toFixed(1), 'km', 'distance'],
            [formatDuration(sec), '', 'moving'],
            [avg.toFixed(1), 'km/h', 'average'],
          ].map(([v, u, l]) => (
            <div key={l}>
              <div className="font-mono text-[17px] font-medium">{v}<span className="text-[10px] text-ink-muted ml-0.5">{u}</span></div>
              <div className="font-mono text-[9px] tracking-[0.15em] uppercase text-ink-muted">{l}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={save} className="flex-1 bg-ink text-paper font-mono text-[11px] tracking-[0.15em] uppercase px-4 py-2.5 rounded hover:bg-alpine cursor-pointer">Save GPX</button>
          <button onClick={onClose} className="flex-1 border border-line font-mono text-[11px] tracking-[0.15em] uppercase px-4 py-2.5 rounded hover:bg-paper-2 cursor-pointer">Close</button>
        </div>
        <p className="mt-3 text-[11px] text-ink-muted">Your track stays on this device unless you save it.</p>
      </div>
    </div>
  );
}
