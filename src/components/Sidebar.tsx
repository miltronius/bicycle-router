import { useRef, useState } from 'react';
import type { Point, Route } from '../types';
import type { PaceMode, PoiOnRoute } from '../App';
import type { ColorBy } from './MapView';
import { TILE_PROVIDERS } from './MapView';
import { PROFILES, OVERLAYS } from '../constants';
import SearchInput from './SearchInput';
import RouteCard from './RouteCard';
import RiderPanel from './RiderPanel';
import { POI_CATEGORIES, POI_BY_ID } from '../lib/poi';
import type { Poi, PoiCategory } from '../lib/poi';
import type { RiderSettings } from '../lib/physics';
import { SAFETY_COLORS, SAFETY_LABELS, SAFETY_ORDER, SURFACE_COLORS, SURFACE_LABELS, SURFACE_ORDER } from '../lib/safety';

interface Props {
  waypoints:       (Point | null)[];
  routes:          Route[];
  activeRouteIdx:  number;
  loading:         boolean;
  error:           string | null;
  modeText:        string | null;
  mobileSheetOpen: boolean;
  rider:           RiderSettings;
  paceMode:        PaceMode;
  profileKeys:     string[];
  colorBy:         ColorBy;
  baseMap:         string;
  overlays:        string[];
  poiCats:         PoiCategory[];
  poisOnRoute:     PoiOnRoute[];
  poiStatus:       'idle' | 'loading' | 'error';
  hasFix:          boolean;
  onSetWaypoint:   (idx: number, p: Point | null) => void;
  onRemoveStop:    (idx: number) => void;
  onMoveStop:      (idx: number, dir: -1 | 1) => void;
  onAddStop:       () => void;
  onReverse:       () => void;
  onUseLocation:   () => void;
  onLocate:        () => void;
  onCopyLink:      () => void;
  onSelectRoute:   (idx: number) => void;
  onStartLive:     (idx: number) => void;
  onRiderChange:   (r: RiderSettings) => void;
  onPaceModeChange: (m: PaceMode) => void;
  onProfileKeysChange: (k: string[]) => void;
  onColorByChange: (c: ColorBy) => void;
  onBaseMapChange: (id: string) => void;
  onOverlaysChange: (ids: string[]) => void;
  onPoiCatsChange: (c: PoiCategory[]) => void;
  onAddPoi:        (p: Poi) => void;
  onHoverPoi:      (p: Poi | null) => void;
  onMobileOpen:    () => void;
  onMobileClose:   () => void;
}

function Section({ title, children, defaultOpen = true, right }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean; right?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="px-6 py-4 border-b border-line-soft">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="flex items-center gap-2 flex-1 text-left cursor-pointer bg-transparent border-none p-0"
        >
          <span className="w-4 h-px bg-line shrink-0" />
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-muted">{title}</span>
          <span className={`text-[9px] text-ink-muted transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        </button>
        {right}
      </div>
      {open && <div className="mt-3">{children}</div>}
    </section>
  );
}

const chip = (on: boolean) =>
  `font-mono text-[10px] tracking-wide px-2 py-1 rounded-full border cursor-pointer transition-colors ${
    on ? 'bg-ink text-paper border-ink' : 'bg-transparent text-ink-soft border-line hover:border-ink-soft'
  }`;

const smallBtn = 'py-1.5 px-2 bg-transparent border border-dashed border-line rounded font-mono text-[10px] tracking-[0.12em] uppercase text-ink-soft hover:bg-paper-2 hover:border-ink-soft hover:text-ink transition-all cursor-pointer disabled:opacity-40 disabled:cursor-default';

export default function Sidebar(props: Props) {
  const {
    waypoints, routes, activeRouteIdx, loading, error, modeText, mobileSheetOpen,
    rider, paceMode, profileKeys, colorBy, baseMap, overlays, poiCats, poisOnRoute, poiStatus, hasFix,
    onSetWaypoint, onRemoveStop, onMoveStop, onAddStop, onReverse, onUseLocation, onLocate, onCopyLink,
    onSelectRoute, onStartLive, onRiderChange, onPaceModeChange, onProfileKeysChange,
    onColorByChange, onBaseMapChange, onOverlaysChange, onPoiCatsChange, onAddPoi, onHoverPoi, onMobileClose,
  } = props;

  // ── Swipe-to-dismiss / expand on mobile (#7) ──
  const [dragY, setDragY] = useState(0);
  const [full, setFull] = useState(false);
  const dragStart = useRef<number | null>(null);
  const onHandleDown = (e: React.PointerEvent) => {
    dragStart.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    if (dragStart.current !== null) setDragY(e.clientY - dragStart.current);
  };
  const onHandleUp = () => {
    if (dragStart.current === null) return;
    dragStart.current = null;
    if (dragY > 80) { if (full) setFull(false); else onMobileClose(); }
    else if (dragY < -60) setFull(true);
    setDragY(0);
  };

  const [showProfiles, setShowProfiles] = useState(false);
  const complete = waypoints.every(Boolean) ? (waypoints as Point[]) : [];

  return (
    <aside
      className={`area-sidebar sidebar-bg bg-paper border-r border-line overflow-y-auto relative${mobileSheetOpen ? ' mobile-open' : ''}${full ? ' sheet-full' : ''}`}
      style={dragY ? { transform: `translateY(${Math.max(-200, dragY)}px)`, transition: 'none' } : undefined}
    >
      {/* Sheet drag-handle pill — visible on mobile only */}
      <div
        className="sheet-handle md:hidden touch-none"
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onPointerCancel={onHandleUp}
        aria-label="Drag to resize or close"
      />

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
          <button
            onClick={onMobileClose}
            aria-label="Close panel"
            className="ml-auto md:hidden w-8 h-8 flex items-center justify-center rounded-lg text-ink-muted hover:bg-paper-2 hover:text-ink transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 16 16" width="14" height="14">
              <path d="M2.5 2.5l11 11m0-11l-11 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
            </svg>
          </button>
        </div>
        <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-muted ml-9 mt-1">
          Bicycle routing · Switzerland
        </p>
      </div>

      {/* ── Waypoints (#2) ── */}
      <Section title="Waypoints" right={
        <button onClick={onCopyLink} title="Copy shareable link" className="font-mono text-[10px] text-ink-muted hover:text-ink cursor-pointer bg-transparent border-none">🔗 Share</button>
      }>
        <div className="flex flex-col gap-2">
          {waypoints.map((w, idx) => (
            <div key={idx} className="flex items-center gap-1">
              <SearchInput
                idx={idx}
                total={waypoints.length}
                point={w}
                onSelect={onSetWaypoint}
                onClear={i => (waypoints.length > 2 && i > 0 && i < waypoints.length - 1 ? onRemoveStop(i) : onSetWaypoint(i, null))}
              />
              {waypoints.length > 2 && (
                <div className="flex flex-col">
                  <button aria-label="Move up" disabled={idx === 0} onClick={() => onMoveStop(idx, -1)} className="text-[10px] leading-none px-1 text-ink-muted hover:text-ink disabled:opacity-30 cursor-pointer">▲</button>
                  <button aria-label="Move down" disabled={idx === waypoints.length - 1} onClick={() => onMoveStop(idx, 1)} className="text-[10px] leading-none px-1 text-ink-muted hover:text-ink disabled:opacity-30 cursor-pointer">▼</button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-1.5 mt-2.5">
          <button onClick={onAddStop} disabled={waypoints.length >= 10} className={smallBtn}>+ Stop</button>
          <button onClick={onReverse} className={smallBtn}>⇅ Reverse</button>
          <button onClick={hasFix ? onUseLocation : onLocate} className={smallBtn} title="Use my current location as the start">
            ◎ {hasFix ? 'From here' : 'Locate'}
          </button>
        </div>

        {modeText && (
          <div className="mt-3 px-3 py-2.5 bg-paper-2 rounded-md flex items-center gap-2 font-mono text-[11px] text-ink-soft" role="status">
            <span className="w-2 h-2 rounded-full bg-alpine animate-velo-pulse shrink-0" />
            {modeText}
          </div>
        )}
      </Section>

      {/* ── Routes ── */}
      <Section title="Routes" right={
        <button onClick={() => setShowProfiles(s => !s)} className="font-mono text-[10px] text-ink-muted hover:text-ink cursor-pointer bg-transparent border-none">
          ⚙ Profiles ({profileKeys.length})
        </button>
      }>
        {showProfiles && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {PROFILES.map(p => {
              const on = profileKeys.includes(p.key);
              return (
                <button
                  key={p.key}
                  className={chip(on)}
                  style={on ? { background: p.color, borderColor: p.color } : undefined}
                  onClick={() => {
                    const next = on ? profileKeys.filter(k => k !== p.key) : [...profileKeys, p.key];
                    if (next.length) onProfileKeysChange(next);
                  }}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col gap-2.5">
            {PROFILES.filter(p => profileKeys.includes(p.key)).map(p => (
              <div key={p.key} className="route-card bg-paper-2 rounded-xl px-4 py-3.5 pointer-events-none"
                   style={{ '--route-color': p.color } as React.CSSProperties}>
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
            Pick points anywhere in Switzerland, by{' '}
            <strong className="not-italic font-medium text-ink" style={{ background: 'linear-gradient(transparent 60%, rgba(200,55,55,0.18) 60%)' }}>
              tapping the map
            </strong>{' '}
            or searching above.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2 font-mono text-[10px] text-ink-muted">
              <span>Times:</span>
              <div className="flex gap-1">
                <button className={chip(paceMode === 'mine')} onClick={() => onPaceModeChange('mine')}>Your pace</button>
                <button className={chip(paceMode === 'brouter')} onClick={() => onPaceModeChange('brouter')}>BRouter</button>
              </div>
            </div>
            <div className="flex flex-col gap-2.5">
              {routes.map((r, idx) => (
                <RouteCard
                  key={r.key}
                  route={r}
                  active={idx === activeRouteIdx}
                  rider={rider}
                  paceMode={paceMode}
                  waypoints={complete}
                  onClick={() => onSelectRoute(idx)}
                  onRide={() => onStartLive(idx)}
                />
              ))}
            </div>
          </>
        )}
      </Section>

      {/* ── Rider & bike (#4, #5) ── */}
      <Section title="Rider & bike" defaultOpen={false}>
        <RiderPanel rider={rider} onChange={onRiderChange} />
      </Section>

      {/* ── Along the route (#10) ── */}
      <Section title="Along the route" right={
        poiStatus === 'loading' ? <span className="w-2 h-2 rounded-full bg-alpine animate-velo-pulse" /> : undefined
      }>
        <div className="flex flex-wrap gap-1.5">
          {POI_CATEGORIES.map(c => {
            const on = poiCats.includes(c.id);
            return (
              <button key={c.id} className={chip(on)} title={c.label}
                onClick={() => onPoiCatsChange(on ? poiCats.filter(x => x !== c.id) : [...poiCats, c.id])}>
                {c.icon} {c.label}
              </button>
            );
          })}
        </div>
        {poiStatus === 'error' && (
          <p className="mt-2 text-[12px] text-alpine-deep">Couldn't load places (Overpass API busy). Try again shortly.</p>
        )}
        {routes.length > 0 && poiCats.length > 0 && poiStatus === 'idle' && (
          poisOnRoute.length === 0 ? (
            <p className="mt-2 text-[12px] text-ink-muted italic">Nothing found within 150 m of this route.</p>
          ) : (
            <ul className="mt-3 flex flex-col max-h-[260px] overflow-y-auto -mx-2">
              {poisOnRoute.slice(0, 80).map(p => (
                <li key={p.id}
                    onMouseEnter={() => onHoverPoi(p)} onMouseLeave={() => onHoverPoi(null)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-paper-2">
                  <span className="w-5 text-center">{POI_BY_ID[p.category].icon}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[12.5px] text-ink truncate">{p.name}</span>
                    <span className="block font-mono text-[9.5px] text-ink-muted">
                      km {(p.distAlong / 1000).toFixed(1)} · {Math.round(p.offset)} m off
                    </span>
                  </span>
                  <button onClick={() => onAddPoi(p)} title="Add as stop"
                          className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-line text-ink-soft hover:bg-ink hover:text-paper cursor-pointer">
                    + stop
                  </button>
                </li>
              ))}
            </ul>
          )
        )}
      </Section>

      {/* ── Map & layers ── */}
      <Section title="Map & layers" defaultOpen={false}>
        <label className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted mb-1">Basemap</label>
        <select
          value={baseMap}
          onChange={e => onBaseMapChange(e.target.value)}
          className="w-full bg-paper-2 rounded px-2 py-1.5 text-[13px] border border-line-soft"
        >
          <option value="auto">Automatic (with failover)</option>
          {TILE_PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <label className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted mt-3 mb-1">Bike networks</label>
        {OVERLAYS.map(o => (
          <label key={o.id} className="flex items-center gap-2 text-[13px] py-0.5 cursor-pointer">
            <input type="checkbox" checked={overlays.includes(o.id)}
              onChange={e => onOverlaysChange(e.target.checked ? [...overlays, o.id] : overlays.filter(x => x !== o.id))} />
            {o.name}
          </label>
        ))}

        <label className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted mt-3 mb-1">Colour active route by</label>
        <div className="flex gap-1">
          {(['profile', 'safety', 'surface'] as const).map(c => (
            <button key={c} className={chip(colorBy === c)} onClick={() => onColorByChange(c)}>{c}</button>
          ))}
        </div>
        {colorBy !== 'profile' && (
          <div className="mt-2 flex flex-col gap-0.5">
            {(colorBy === 'safety' ? SAFETY_ORDER : SURFACE_ORDER).map(k => (
              <span key={k} className="flex items-center gap-2 text-[11.5px] text-ink-soft">
                <span className="w-4 h-1.5 rounded-full" style={{ background: (colorBy === 'safety' ? SAFETY_COLORS : SURFACE_COLORS)[k as never] }} />
                {(colorBy === 'safety' ? SAFETY_LABELS : SURFACE_LABELS)[k as never]}
              </span>
            ))}
          </div>
        )}
      </Section>

      <p className="px-6 py-4 font-mono text-[9.5px] leading-relaxed text-ink-muted">
        Routing © BRouter · Data © OpenStreetMap contributors · Search © Photon / Nominatim · Places © Overpass
      </p>
    </aside>
  );
}
