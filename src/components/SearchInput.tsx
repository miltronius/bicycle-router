import { useState, useRef, useCallback, useEffect } from 'react';
import type { Point } from '../types';
import { searchPlaces, searchNominatim } from '../services/geocode';
import type { GeocodeResult } from '../services/geocode';

interface Props {
  idx:      number;
  total:    number;
  point:    Point | null;
  onSelect: (idx: number, p: Point) => void;
  onClear:  (idx: number) => void;
}

export default function SearchInput({ idx, total, point, onSelect, onClear }: Props) {
  const [query, setQuery]             = useState('');
  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
  const [open, setOpen]               = useState(false);
  const [busy, setBusy]               = useState(false);
  const [highlight, setHighlight]     = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctrlRef  = useRef<AbortController | null>(null);

  useEffect(() => () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    ctrlRef.current?.abort();
  }, []);

  const isFirst = idx === 0;
  const isLast  = idx === total - 1;
  const letter  = String.fromCharCode(65 + idx);
  const hasValue = point !== null || query.length > 0;

  const runSearch = useCallback(async (val: string, fallback = false) => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setBusy(true);
    try {
      let results: GeocodeResult[] = [];
      try {
        results = await searchPlaces(val, ctrl.signal);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        if (fallback) results = await searchNominatim(val, ctrl.signal);
      }
      if (ctrl.signal.aborted) return;   // a newer query superseded this one
      setSuggestions(results);
      setHighlight(0);
      setOpen(true);
    } catch {
      if (!ctrl.signal.aborted) { setSuggestions([]); setOpen(true); }
    } finally {
      if (!ctrl.signal.aborted) setBusy(false);
    }
  }, []);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    if (val.trim().length < 3) { ctrlRef.current?.abort(); setSuggestions([]); setOpen(false); setBusy(false); return; }
    timerRef.current = setTimeout(() => { void runSearch(val); }, 250);
  }, [runSearch]);

  const handleSelect = useCallback((r: GeocodeResult) => {
    onSelect(idx, { lat: r.lat, lng: r.lng, name: r.name });
    setQuery('');
    setSuggestions([]);
    setOpen(false);
  }, [idx, onSelect]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onClear(idx);
    setQuery('');
    setSuggestions([]);
    setOpen(false);
  }, [idx, onClear]);

  const handleKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (point) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, suggestions.length - 1)); setOpen(true); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && suggestions[highlight]) handleSelect(suggestions[highlight]);
      else if (query.trim().length >= 3) void runSearch(query, true);
    }
  }, [point, suggestions, highlight, open, query, handleSelect, runSearch]);

  const badgeClass = isFirst ? 'bg-ink' : isLast ? 'bg-alpine' : 'bg-via';
  const placeholder = isFirst ? 'Start — search or click map' : isLast ? 'Destination' : `Stop ${letter}`;

  return (
    <div className="relative flex-1 min-w-0">
      <div className="relative">
        <span className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-[22px] h-[22px] rounded-full flex items-center justify-center font-display font-semibold text-[13px] text-paper pointer-events-none z-10 ${badgeClass}`}>
          {letter}
        </span>

        <input
          type="text"
          value={point ? point.name : query}
          onChange={point ? undefined : handleInput}
          onKeyDown={handleKey}
          readOnly={point !== null}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-autocomplete="list"
          aria-expanded={open}
          onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          className="w-full pl-[42px] pr-9 py-[10px] font-sans text-sm bg-paper-2 border border-transparent rounded-lg text-ink outline-none transition-all duration-150 placeholder:text-ink-muted focus:bg-white focus:border-ink focus:shadow-soft text-ellipsis"
          autoComplete="off"
        />

        {busy && !point && (
          <span className="absolute right-9 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-alpine animate-velo-pulse" />
        )}

        {hasValue && (
          <button
            onMouseDown={handleClear}
            aria-label={`Clear ${placeholder}`}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-[22px] h-[22px] rounded-full flex items-center justify-center text-[13px] text-ink-muted hover:bg-paper-3 hover:text-ink transition-colors cursor-pointer border-none bg-transparent"
          >
            ✕
          </button>
        )}
      </div>

      {open && (
        <div role="listbox" className="absolute top-[calc(100%+4px)] left-0 right-0 bg-white border border-line rounded-lg shadow-card z-20 max-h-[240px] overflow-y-auto">
          {suggestions.length === 0 ? (
            <div className="px-3.5 py-2.5 text-[13px] text-ink-muted">No results in Switzerland — press Enter to retry</div>
          ) : (
            suggestions.map((r, i) => (
              <button
                key={`${r.lat},${r.lng},${i}`}
                role="option"
                aria-selected={i === highlight}
                onMouseDown={e => { e.preventDefault(); handleSelect(r); }}
                onMouseEnter={() => setHighlight(i)}
                className={`w-full text-left px-3.5 py-2.5 border-b border-line-soft last:border-none cursor-pointer transition-colors ${i === highlight ? 'bg-paper-2' : ''}`}
              >
                <div className="text-[13px] text-ink">{r.name}</div>
                {r.detail && <div className="text-[11px] text-ink-muted mt-0.5">{r.detail}</div>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
