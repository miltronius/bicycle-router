import type { Point, Route, PointKey } from '../types';
import { PROFILES } from '../constants';
import SearchInput from './SearchInput';
import RouteCard from './RouteCard';

interface Props {
  pointA:          Point | null;
  pointB:          Point | null;
  routes:          Route[];
  activeRouteIdx:  number;
  loading:         boolean;
  error:           string | null;
  modeText:        string | null;
  mobileSheetOpen: boolean;
  onSetPoint:      (which: PointKey, lat: number, lng: number, name: string) => void;
  onClearPoint:    (which: PointKey) => void;
  onSwapPoints:    () => void;
  onSelectRoute:   (idx: number) => void;
  onMobileClose:   () => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="w-4 h-px bg-line shrink-0" />
      <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-muted">{children}</span>
    </div>
  );
}

export default function Sidebar({
  pointA, pointB, routes, activeRouteIdx, loading, error, modeText,
  mobileSheetOpen, onSetPoint, onClearPoint, onSwapPoints, onSelectRoute, onMobileClose,
}: Props) {
  return (
    <aside className={`area-sidebar sidebar-bg bg-paper border-r border-line overflow-y-auto relative${mobileSheetOpen ? ' mobile-open' : ''}`}>

      {/* Sheet drag-handle pill — visible on mobile only */}
      <div className="sheet-handle md:hidden" />

      {/* ── Brand header ── */}
      <div className="px-6 pt-4 pb-4 border-b border-line-soft">
        <div className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-full bg-alpine flex items-center justify-center font-display font-bold text-base italic text-paper translate-y-0.5"
                style={{ boxShadow: '0 0 0 3px var(--color-paper), 0 0 0 4px var(--color-alpine)' }}>
            Z
          </span>
          <h1 className="font-display font-normal text-[30px] tracking-tight leading-none">
            Zürich<em className="italic font-light text-alpine">Velo</em>
          </h1>
          {/* Close button — mobile only */}
          <button
            onClick={onMobileClose}
            aria-label="Close panel"
            className="ml-auto md:hidden w-8 h-8 flex items-center justify-center rounded-lg text-ink-muted hover:bg-paper-2 hover:text-ink transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
              <path d="M2.5 2.5l11 11m0-11l-11 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
            </svg>
          </button>
        </div>
        <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-muted ml-9 mt-1">
          Bicycle routing · Switzerland
        </p>
      </div>

      {/* ── Waypoints ── */}
      <div className="px-6 py-5 border-b border-line-soft">
        <SectionLabel>Waypoints</SectionLabel>
        <div className="flex flex-col gap-2">
          <SearchInput which="a" point={pointA} onSelect={onSetPoint} onClear={onClearPoint} />
          <SearchInput which="b" point={pointB} onSelect={onSetPoint} onClear={onClearPoint} />
        </div>

        <button
          onClick={onSwapPoints}
          className="w-full mt-2.5 py-2 bg-transparent border border-dashed border-line rounded font-mono text-[10px] tracking-[0.15em] uppercase text-ink-soft hover:bg-paper-2 hover:border-ink-soft hover:text-ink transition-all cursor-pointer"
        >
          ⇅ Swap waypoints
        </button>

        {modeText && (
          <div className="mt-3 px-3 py-2.5 bg-paper-2 rounded-md flex items-center gap-2 font-mono text-[11px] text-ink-soft">
            <span className="w-2 h-2 rounded-full bg-alpine animate-velo-pulse shrink-0" />
            {modeText}
          </div>
        )}
      </div>

      {/* ── Routes ── */}
      <div className="px-6 py-5 border-b border-line-soft">
        <SectionLabel>Routes</SectionLabel>

        {loading ? (
          <div className="flex flex-col gap-2.5">
            {PROFILES.map(p => (
              <div
                key={p.key}
                className="route-card bg-paper-2 rounded-xl px-4 py-3.5 pointer-events-none"
                style={{ '--route-color': p.color } as React.CSSProperties}
              >
                <div className="flex justify-between items-baseline mb-1.5 pl-3">
                  <span className="font-display text-[19px] skeleton-shimmer rounded inline-block w-32">&nbsp;</span>
                  <span className="font-mono text-[9px] skeleton-shimmer rounded inline-block w-10 px-1.5 py-0.5">&nbsp;</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2.5 pt-2.5 border-t border-line-soft pl-3">
                  {['distance', 'time', 'ascent'].map(l => (
                    <div key={l}>
                      <div className="font-mono text-[15px] skeleton-shimmer rounded w-12">&nbsp;</div>
                      <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-ink-muted mt-0.5">{l}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="px-3.5 py-3 bg-[rgba(200,55,55,0.08)] border-l-[3px] border-alpine rounded text-[13px] text-alpine-deep leading-relaxed">
            {error}
          </div>
        ) : routes.length === 0 ? (
          <p className="font-display text-[16px] italic font-light text-ink-soft leading-relaxed">
            Pick two points anywhere in Switzerland, by{' '}
            <strong className="not-italic font-medium text-ink" style={{ background: 'linear-gradient(transparent 60%, rgba(200,55,55,0.18) 60%)' }}>
              tapping the map
            </strong>{' '}
            or searching above.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {routes.map((r, idx) => (
              <RouteCard
                key={r.key}
                route={r}
                active={idx === activeRouteIdx}
                onClick={() => onSelectRoute(idx)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Coordinates ── */}
      {(pointA ?? pointB) && (
        <div className="px-6 py-5">
          <SectionLabel>Coordinates</SectionLabel>
          {pointA && (
            <div className="flex justify-between font-mono text-[10px] text-ink-muted py-1">
              <span className="text-ink-soft">A</span>
              <span>{pointA.lat.toFixed(5)}°N &nbsp;{pointA.lng.toFixed(5)}°E</span>
            </div>
          )}
          {pointB && (
            <div className="flex justify-between font-mono text-[10px] text-ink-muted py-1">
              <span className="text-ink-soft">B</span>
              <span>{pointB.lat.toFixed(5)}°N &nbsp;{pointB.lng.toFixed(5)}°E</span>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
