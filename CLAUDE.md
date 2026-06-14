# CLAUDE.md

Context for Claude Code working on **ZürichVelo**, a bicycle route planner for Switzerland.

---

## What this is

A React + TypeScript single-page app that finds and compares cycling routes across
Switzerland. The user sets two waypoints (A → B) — by clicking the map, typing in the
search boxes, or dragging the existing pins — and gets up to 5 route options, each with
distance/time/ascent/descent stats and an interactive elevation profile that syncs a hover
marker on the map.

The pre-loaded route on startup is **Zürich Bahnhofplatz → Affoltern am Alibis** so the
app is immediately usable without any setup.

---

## How to run

```bash
pnpm dev        # start dev server at http://localhost:5173
pnpm build      # TypeScript check + Vite production build
pnpm preview    # preview production build locally
```

**Tile CSP gotcha**: if tiles are blank, open the app from the local dev server, not a
sandboxed preview iframe. This is never a code bug.

---

## Stack

| Layer     | Choice                          | Why                                                   |
|-----------|---------------------------------|-------------------------------------------------------|
| Framework | React 18 + Vite 5               | Fast HMR, minimal config                              |
| Language  | TypeScript 5 (strict)           | Full type safety, editor autocomplete                 |
| Styling   | Tailwind CSS v4                 | Utility-first; design tokens live in `@theme` in CSS  |
| Map       | Leaflet 1.9 (vanilla)           | Imperative API fits better than react-leaflet here    |
| Charts    | Chart.js 4 (vanilla canvas)     | Simple canvas API, great for elevation profiles       |
| Routing   | BRouter (brouter.de)            | Free, keyless, dedicated cycling router               |
| Geocoding | Nominatim (OSM)                 | Free, keyless, Switzerland-bounded search             |

---

## Project structure

```text
bicycle-router/
├── index.html                  Entry point; loads fonts + /src/main.tsx
├── vite.config.ts              Vite + React + Tailwind CSS v4 plugins
├── tsconfig.json               References app + node tsconfigs
├── tsconfig.app.json           Strict TS config for src/
├── tsconfig.node.json          Strict TS config for vite.config.ts
├── package.json
│
└── src/
    ├── main.tsx                createRoot → <App />
    ├── App.tsx                 All shared state; fetches routes; owns map↔chart sync
    ├── index.css               Tailwind @import + @theme tokens + custom CSS
    ├── types.ts                Shared TypeScript interfaces
    ├── constants.ts            Geographic bounds, PROFILES, tile providers, utilities
    ├── vite-env.d.ts           /// <reference types="vite/client" />
    │
    └── components/
        ├── MapView.tsx         Leaflet map; all imperative map code lives here
        ├── Sidebar.tsx         Left column: header, waypoint inputs, route list, coords
        ├── SearchInput.tsx     Nominatim autocomplete input (A or B)
        ├── RouteCard.tsx       Single route card (stats + GPX download button)
        └── ElevationPanel.tsx  Chart.js elevation profile; emits hover events up to App
```

---

## Architecture — data flow

```text
App (state owner)
 ├─ pointA / pointB (Point | null)     set by: map click, search, drag, swap, clear
 ├─ routes (Route[])                   fetched from BRouter whenever both points change
 ├─ activeRouteIdx (number)            set by: route card click, polyline click
 ├─ hoverLatLng (HoverLatLng | null)   set by: elevation chart hover → syncs map marker
 ├─ sidebarWidth / elevationHeight     draggable panel dimensions (CSS vars on .app)
 ├─ loading / error / flashMsg         UI states
 │
 ├─→ MapView          receives pointA/B, routes, activeRouteIdx, hoverLatLng
 │                    emits onMapClick, onDragEnd, onRouteClick
 │
 ├─→ Sidebar          receives all display state + onResizeStart
 │    └─→ SearchInput  emits onSelect (geocode result) / onClear
 │    └─→ RouteCard    emits onClick; has inline GPX download
 │
 └─→ ElevationPanel   receives activeRoute + onResizeStart; emits onHoverChange
```

**Key invariant**: `App` is the single source of truth. `MapView` and `ElevationPanel` are
"controlled" — they update Leaflet/Chart.js imperatively via `useEffect` whenever their
props change.

---

## State management in detail (`App.tsx`)

### Stale-closure safety

Stable callbacks (map click handler, drag handler) never reference state directly. Instead:

```ts
const pointARef = useRef<Point | null>(pointA);
useEffect(() => { pointARef.current = pointA; }, [pointA]);
```

This lets Leaflet event listeners (registered once) always read the current value without
being recreated on every render.

### Route fetching

A `useEffect([pointA, pointB])` fires whenever either point changes. It runs all PROFILES
fetches in parallel via `Promise.allSettled`, de-duplicates identical tracks via
`computeSignature()`, and builds the elevation profile before setting `routes`.

The `cancelled` flag prevents a stale result from landing after the component unmounts or
after the user changes a point while a previous fetch is still in flight.

### Reverse geocoding

`handleMapClick` and `handleDragEnd` both set the point immediately with raw coordinates,
then fire a Nominatim reverse-geocode in the background. When it resolves, a functional
state update replaces the name only if the coordinates still match (guards against a
drag that moved again before the geocode returned).

```ts
setPointA({ lat, lng, name: coordName });
reverseGeocode(lat, lng).then(name =>
  setPointA(p => p?.lat === lat && p?.lng === lng ? { ...p, name } : p)
);
```

### Resizable panels

`sidebarWidth` (default 320 px, min 200, max 600) and `elevationHeight` (default 160 px,
min 80, max 400) are React state. They are applied as CSS custom properties on the `.app`
div so the grid and the elevation panel's open height both update in one paint:

```tsx
<div style={{ '--sidebar-width': `${sidebarWidth}px`, '--elevation-height': `${elevationHeight}px` }}>
```

Drag handlers capture the start position and add `mousemove`/`mouseup` listeners directly
on `document` so the drag continues even if the cursor leaves the handle element.

### Flash message

`flashMsg` is set for transient UI notes. A `useEffect` auto-clears it after 2.4 s.

---

## MapView (`src/components/MapView.tsx`)

MapView owns all Leaflet state imperatively. Everything is managed through refs; React
state is only used for the tile status badge and error overlay.

### Lifecycle effects

| Effect trigger             | What it does                                                  |
|----------------------------|---------------------------------------------------------------|
| `[]` (mount once)          | Create map, start tile failover, wire click + ResizeObserver  |
| `[pointA]`                 | Remove old marker A, create new one, wire dragend             |
| `[pointB]`                 | Same for B                                                    |
| `[routes]`                 | Clear old polylines, draw halo+line per route, fit bounds     |
| `[activeRouteIdx, routes]` | Re-style all polylines (weight/opacity/bringToFront)          |
| `[hoverLatLng, ...]`       | Show/hide circle marker at elevation hover position           |

### ResizeObserver

A `ResizeObserver` on the map container div calls `map.invalidateSize()` whenever the
container changes size (sidebar drag, elevation drag, window resize). This replaces the
previous `window.resize` only approach.

### Tile failover

`activateProviderRef.current` is a recursive function stored in a ref (not `useCallback`)
to avoid the circular-dependency problem with recursive `useCallback`. On each attempt it:

1. Removes the previous tile layer.
2. Loads the next provider in `TILE_PROVIDERS`.
3. If no tile loads within 4 s, recurses to `idx + 1`.
4. If all providers fail, shows the tile-error overlay.

The user's manual layer-picker (top-left) bypasses failover and cancels the timer.

### Marker anchor

Markers use `L.divIcon` with `iconAnchor: [16, 40]` to pin the pointed tip to the map
coordinate. The CSS for `.marker-pin` must NOT include any `transform: translate(…)` —
that conflicts with Leaflet's own positioning and causes pins to drift on zoom.

### Callback ref pattern

`onMapClick`, `onDragEnd`, `onRouteClick` are all mirrored into refs updated every render,
so Leaflet event listeners registered once always call the current handler.

---

## Routing profiles (`src/constants.ts`)

Five profiles are fetched in parallel for every route request. Duplicate tracks (same GPS
footprint) are silently dropped by `computeSignature`.

| UI label     | BRouter profile      | Intent                                          |
|--------------|----------------------|-------------------------------------------------|
| Fastest      | `fastbike`           | Speed-optimised road cycling                    |
| Low Traffic  | `fastbike-lowtraffic`| Fast but penalises busy roads                   |
| Balanced     | `trekking`           | Good blend of speed & comfort                   |
| Car-free     | `trekking-nocar`     | Avoids any road shared with cars                |
| Safety       | `safety`             | Dedicated bike infrastructure only              |

---

## Geographic coverage (`src/constants.ts`)

Covers all of Switzerland:

```ts
BOUNDS_SW = [45.82, 5.95]   // Geneva / Valais SW corner
BOUNDS_NE = [47.81, 10.49]  // Schaffhausen / Graubünden NE corner
INITIAL_CENTER = [46.80, 8.23]  // approx centre of Switzerland
INITIAL_ZOOM = 8
NOMINATIM_VIEWBOX = '5.95,47.81,10.49,45.82'
```

The map uses these as `maxBounds` with `minZoom: 7`.

---

## Elevation profile (`src/components/ElevationPanel.tsx`)

Uses **vanilla Chart.js** (not react-chartjs-2). Key behaviours:

- **Starts at exactly 0**: `buildElevationProfile` prepends a synthetic point at
  `distance: 0` from the GeoJSON start coordinate before the BRouter message rows, because
  the first message row represents the first decision point (non-zero distance from start).
- **Fills full width**: the x-axis has `min: 0` and `max: totalKm` set explicitly so
  Chart.js does not round up the right edge.
- **Responsive height**: the chart container is `flex-1 min-h-0` inside a `flex flex-col`
  panel, so it fills whatever height remains after the stats header regardless of panel
  resize.
- **Stats shown**: distance, `↑` ascent (from BRouter `filtered ascend`), `↓` descent
  (summed from profile point deltas), and elevation range min–max.
- The `onHover` callback always reads from `onHoverRef.current` (a ref updated every
  render) so the chart never needs to be recreated when the callback changes.
- When the panel has no route, it renders a zero-height `<div class="elevation-panel">`
  so the CSS height transition animates correctly when a route arrives.

---

## Tile providers

Built by `buildTileProviders(API_KEYS)`. Keyed providers (Thunderforest, MapTiler) come
first when a key is present. Keyless fallbacks follow:
ESRI Topo → OSM Germany → CARTO Voyager → OpenTopoMap → OSM Standard.

Paste free keys into `API_KEYS` at the top of `src/constants.ts`:

- **Thunderforest** — 150k tiles/mo — OpenCycleMap shows bike lanes
- **MapTiler** — 100k tiles/mo — beautiful topo / outdoor maps

---

## Styling (`src/index.css` + Tailwind v4)

### Design tokens → Tailwind utilities

All palette, typography, and shadow values are defined in `@theme` in `index.css`:

```css
@theme {
  --color-paper: #f4efe6;               /* → bg-paper, text-paper … */
  --color-alpine: #c83737;              /* → bg-alpine, text-alpine … */
  --font-family-display: 'Fraunces', serif;
  --shadow-card: 0 4px 8px …;
}
```

### CSS custom properties for dynamic values

The app grid column and elevation panel height use CSS vars set from React state:

```css
.app { grid-template-columns: var(--sidebar-width, 320px) 1fr; }
.elevation-panel.open { height: var(--elevation-height, 160px); }
```

### Dynamic per-route colour

Route cards use a `::before` pseudo-element for the colour bar, driven by a CSS custom
property set inline:

```tsx
<div style={{ '--route-color': route.color } as React.CSSProperties}>
```

```css
.route-card::before { background: var(--route-color); }
```

---

## GPX export (`src/components/RouteCard.tsx`)

Each route card has a download button. `downloadGPX` serialises the BRouter GeoJSON
coordinates (with elevation if present) into GPX 1.1 format, creates a Blob URL, clicks a
synthetic `<a>` element, and revokes the URL. The click handler calls `e.stopPropagation()`
so the card selection click is not also triggered.

---

## SearchInput (`src/components/SearchInput.tsx`)

- Geocodes via Nominatim with a 300 ms debounce.
- Results are bounded by `NOMINATIM_VIEWBOX` (Switzerland-wide).
- `onMouseDown` (not `onClick`) is used for suggestion selection to fire before the
  input's `onBlur`, which would otherwise close the dropdown before the click registers.
  The `onBlur` uses a 180 ms `setTimeout` for the same reason.
- When `point` is set (a result was already chosen), the input becomes `readOnly` and
  shows the place name. A clear button removes it.

---

## Good test routes

- **Zürich HB → Affoltern am Albis** — the pre-loaded default; ~20 km, real climb
- **Hauptbahnhof → Uetliberg** — heavy climb; makes the elevation profile dramatic
- **ETH Zentrum → ETH Hönggerberg** — Fastest vs Car-free diverge noticeably
- **Bellevue → Tiefenbrunnen** — flat lakeside; Safety prefers the lake path
- **Bern → Thun** — longer route showing profile deduplication in action
- **Geneva → Lausanne** — cross-canton; tests Switzerland-wide bounds

---

## Known gotchas

- **Sandbox tiles** — always open from the dev server, not an iframe.
- **`map.invalidateSize()`** — called at 100 ms and 500 ms after init, plus via
  `ResizeObserver` on the map container. Keeps tiles correct after sidebar/elevation drags.
- **BRouter out-of-bounds** — points in a lake or field return no route → "Could not
  compute any route". Not a bug.
- **Profile deduplication** — if two profiles produce the same GPS footprint, only the
  first one appears. Silent by design.
- **pnpm esbuild build scripts** — `pnpm install` may warn about ignored build scripts.
  Run `pnpm rebuild esbuild` once after a fresh install if Vite fails to start.
- **Elevation profile start** — BRouter messages begin at the first decision point, not
  the route origin. `buildElevationProfile` prepends the GeoJSON start coordinate to ensure
  the profile always begins at distance = 0.

---

## Likely future work

- Thunderforest / MapTiler API key for a bike-lane-aware basemap.
- More BRouter profiles (gravel, MTB, e-bike).
- Persist last-used waypoints and chosen basemap in `localStorage`.
- Mobile: collapse sidebar to a bottom sheet.
- Turn-by-turn directions from BRouter messages.
