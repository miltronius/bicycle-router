import { useState, useRef, useCallback } from 'react';
import { NOMINATIM_VIEWBOX } from '../constants';
import type { Point, PointKey } from '../types';

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

interface Props {
  which:    PointKey;
  point:    Point | null;
  onSelect: (which: PointKey, lat: number, lng: number, name: string) => void;
  onClear:  (which: PointKey) => void;
}

async function geocode(query: string): Promise<NominatimResult[]> {
  if (query.length < 3) return [];
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&viewbox=${NOMINATIM_VIEWBOX}&bounded=1&addressdetails=1`;
    const r = await fetch(url, { headers: { 'Accept-Language': 'de,en' } });
    return r.json() as Promise<NominatimResult[]>;
  } catch {
    return [];
  }
}

export default function SearchInput({ which, point, onSelect, onClear }: Props) {
  const [query, setQuery]           = useState('');
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [open, setOpen]             = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isA     = which === 'a';
  const hasValue = point !== null || query.length > 0;

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    if (val.length < 3) { setSuggestions([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      const results = await geocode(val);
      setSuggestions(results);
      setOpen(results.length > 0);
    }, 300);
  }, []);

  const handleSelect = useCallback((r: NominatimResult) => {
    const name = r.display_name.split(',').slice(0, 2).join(',').trim();
    onSelect(which, parseFloat(r.lat), parseFloat(r.lon), name);
    setQuery('');
    setSuggestions([]);
    setOpen(false);
  }, [which, onSelect]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onClear(which);
    setQuery('');
    setSuggestions([]);
    setOpen(false);
  }, [which, onClear]);

  return (
    <div className="relative">
      <div className="relative">
        {/* Point badge (A / B) */}
        <span className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-[22px] h-[22px] rounded-full flex items-center justify-center font-display font-semibold text-[13px] text-paper pointer-events-none z-10 ${isA ? 'bg-ink' : 'bg-alpine'}`}>
          {which.toUpperCase()}
        </span>

        <input
          type="text"
          value={point ? point.name : query}
          onChange={point ? undefined : handleInput}
          readOnly={point !== null}
          placeholder={isA ? 'Start — search or click map' : 'Destination'}
          onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          className="w-full pl-[42px] pr-9 py-[11px] font-sans text-sm bg-paper-2 border border-transparent rounded-lg text-ink outline-none transition-all duration-150 placeholder:text-ink-muted focus:bg-white focus:border-ink focus:shadow-soft"
          autoComplete="off"
        />

        {hasValue && (
          <button
            onMouseDown={handleClear}
            aria-label="Clear"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-[22px] h-[22px] rounded-full flex items-center justify-center text-[13px] text-ink-muted hover:bg-paper-3 hover:text-ink transition-colors cursor-pointer border-none bg-transparent"
          >
            ✕
          </button>
        )}
      </div>

      {/* Autocomplete dropdown */}
      {open && (
        <div className="absolute top-[calc(100%+4px)] left-0 right-0 bg-white border border-line rounded-lg shadow-card z-10 max-h-[220px] overflow-y-auto">
          {suggestions.length === 0 ? (
            <div className="px-3.5 py-2.5 text-[13px] text-ink-muted">No results in this area</div>
          ) : (
            suggestions.map((r, i) => {
              const main = r.display_name.split(',')[0];
              const sub  = r.display_name.split(',').slice(1, 4).join(',').trim();
              return (
                <button
                  key={i}
                  onMouseDown={e => { e.preventDefault(); handleSelect(r); }}
                  className="w-full text-left px-3.5 py-2.5 border-b border-line-soft last:border-none hover:bg-paper-2 cursor-pointer transition-colors"
                >
                  <div className="text-[13px] text-ink">{main}</div>
                  {sub && <div className="text-[11px] text-ink-muted mt-0.5">{sub}</div>}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
