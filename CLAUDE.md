# CLAUDE.md

Context for Claude Code working on **ZürichVelo**, a bicycle route planner for Switzerland.

---

## What this is

A React + TypeScript single-page app that plans and compares cycling routes across
Switzerland. The user sets an ordered list of waypoints (start, optional stops, destination)
in any of these ways:
- by clicking the map
- by searching
- by dragging pins
- by adding a place found along the route

The app returns one route per enabled BRouter profile. Each route has:
- distance, time and ascent stats
- a power/pace estimate from a physics model
- a traffic-exposure breakdown
- an elevation profile that syncs a hover marker on the map

**Live mode** turns the selected route into GPS-guided riding with off-route rerouting.

The default route on startup is **Zürich Bahnhofplatz → Affoltern am Albis**. URL params
override it, and so does the last route saved in `localStorage`.

Planning lives in `ROADMAP.md`: status, specs for each GitHub issue, and the idea backlog.
Keep it updated when you ship or discover something.

---

## How to run

```bash
pnpm dev        # dev server at http://localhost:5173
pnpm test       # Vitest unit tests (src/lib/**)
pnpm lint       # ESLint (flat config, typescript-eslint + react-hooks)
pnpm build      # tsc -b + Vite production build
```

CI runs `lint`, `test` and `build` on every PR (`.github/workflows/ci.yml`).

**Tile CSP gotcha**: if tiles are blank, open the app from the local dev server, not a
sandboxed preview iframe. This is never a code bug.

**Testing without network**: the external APIs are not reachable from some sandboxes.
For browser checks, intercept requests with Playwright `page.route()` and return a
synthetic BRouter GeoJSON (see `src/lib/__tests__/fixture.ts` for the shape, including
the `messages` table with `WayTags`).

---

## Stack

| Layer     | Choice                          | Notes                                                       |
|-----------|---------------------------------|-------------------------------------------------------------|
| Framework | React 19 + Vite 6               | StrictMode on — effects mount twice in dev                  |
| Language  | TypeScript 5 (strict, ES2022)   |                                                             |
| Styling   | Tailwind CSS v4                 | Tokens in `@theme` in `index.css`                           |
| Map       | Leaflet 1.9 (vanilla)           | Imperative, all in `MapView.tsx`                            |
| Charts    | Chart.js 4 (vanilla canvas)     | `ElevationPanel.tsx`                                        |
| Routing   | BRouter (brouter.de)            | `VITE_BROUTER_URL` to self-host                             |
| Search    | Photon (photon.komoot.io)       | Autocomplete. **Never** use Nominatim for type-ahead (policy) |
| Reverse   | Nominatim                       | Serialised to ≤ 1 req/s + cached (`services/geocode.ts`)    |
| Places    | Overpass API                    | Two endpoints with failover, cached per route               |
| Tests     | Vitest                          | Pure logic only, no DOM                                     |

---

## Project structure

```text
src/
├── main.tsx
├── App.tsx                 State owner: waypoints, rider, live mode, POIs, URL sync
├── index.css               Tailwind @import + @theme tokens + custom CSS
├── types.ts                Point, Profile, Route, BRouterGeoJSON …
├── constants.ts            Bounds, PROFILES, tile providers, OVERLAYS, API_KEYS (env)
│
├── lib/                    Pure, unit-tested logic (no React, no DOM)
│   ├── geo.ts              haversine, cumulativeDistances, snapToLine, simplify, format*
│   ├── route.ts            buildElevationProfile, buildWaySegments, computeSignature, summarize
│   ├── physics.ts          Power model: solveSpeed, estimateRide, powerAtGrade, BIKES
│   ├── safety.ts           classifySafety / classifySurface from OSM way tags
│   ├── poi.ts              POI categories → Overpass QL; parse/categorise results
│   ├── live.ts             Live tracker: progress, off-route, remainingAscent, findClimbs
│   ├── url.ts              ?wp=…&p=…&map=… encode/decode
│   ├── gpx.ts              toGPX (planned + recorded tracks), downloadText
│   ├── storage.ts          Safe localStorage load/save
│   └── __tests__/          Vitest specs + synthetic BRouter fixture
│
├── services/               Network I/O
│   ├── brouter.ts          fetchRoute(waypoints, profile, signal)
│   ├── geocode.ts          searchPlaces (Photon), searchNominatim, reverseGeocode
│   └── overpass.ts         fetchPoisAlong(routeKey, coords, categories)
│
├── hooks/
│   ├── useRoutes.ts        Fetch all enabled profiles, dedupe, AbortController
│   ├── useGeolocation.ts   watchPosition wrapper with accuracy filtering
│   └── useWakeLock.ts      Screen wake lock during live mode
│
└── components/
    ├── MapView.tsx         Leaflet: markers, routes, class colouring, POIs, user dot, tiles
    ├── Sidebar.tsx         Collapsible sections: waypoints, routes, rider, places, layers
    ├── SearchInput.tsx     Photon autocomplete for one waypoint (keyboard nav)
    ├── RouteCard.tsx       Stats, pace/power/battery, safety bar, GPX, Start ride
    ├── RiderPanel.tsx      Bike type, effort (W), weight, e-bike assist + battery
    ├── ElevationPanel.tsx  Chart.js profile; tooltip shows grade + watts; live progress
    ├── LiveHUD.tsx         Live-mode heads-up display
    └── RideSummary.tsx     End-of-ride dialog + GPX save
```

`docs/` holds the README screenshot and `docs/legacy/zurich_velo.html`, the original
single-file prototype. It isn't built.

---

## Architecture — data flow

```text
App (state owner)
 ├─ waypoints: (Point | null)[]    ≥ 2 entries; null = slot waiting for a map click/search
 ├─ profileKeys / preferredProfile which profiles to fetch / which to select after fetch
 ├─ useRoutes(waypoints, profiles) → routes, loading, error  (re-fetch only on coord/profile change)
 ├─ rider, paceMode                persisted (localStorage) → RouteCard, ElevationPanel, LiveHUD
 ├─ baseMap, overlays, colorBy     map display state (baseMap also in URL)
 ├─ poiCats → pois → poisOnRoute   Overpass, then snapped to the active route (distAlong, offset)
 ├─ locating / live → useGeolocation → fix
 ├─ tracker (live)                 updateTracker(fix) → progress, off-route → reroute
 └─ URL + localStorage sync        replaceState on every planning change (not during live)
```

**Key invariant**: `App` is the single source of truth. `MapView` and `ElevationPanel` are
controlled components. They update Leaflet and Chart.js imperatively in `useEffect` when
their props change.

**Pure logic belongs in `src/lib/` with tests.** Components should stay thin. If you add
maths, parsing or classification, put it in `lib/` and add a spec.

---

## Key behaviours

### Waypoints (#2)

- A map click fills the first `null` slot. "+ Stop" inserts a `null` before the destination.
- **Adding a place as a stop** (`insertStopAlongRoute`) snaps every waypoint and the place
  onto the active route. It then inserts the place before the first waypoint that lies further
  along. This keeps the stop order natural.
- Names are filled in the background by reverse geocoding. The functional update only applies
  if the coordinates still match, which guards against drag races.

### Route fetching (`useRoutes`)

- The effect depends on a string key made of coordinates and profiles, so renaming a waypoint
  doesn't trigger a re-fetch.
- The `AbortController` cancels in-flight requests.
- `loading` is always reset, including when the waypoints become incomplete.
- Duplicate tracks are dropped by `signature`.
- During live mode only the active profile is fetched, to keep reroutes cheap.

### Shareable state (#8)

- `?wp=lat,lng~Name|lat,lng~Name&p=<profile>&map=<basemap>`
- Decoding validates the Swiss bounds and the parameter format.
- The last complete waypoint list is also saved in `localStorage` (`zv.waypoints`).
- Other persisted keys: `zv.rider`, `zv.pace`, `zv.profiles`, `zv.basemap`, `zv.overlays`, `zv.poicats`.

### Physics (#4, #5) — `lib/physics.ts`

```text
P_wheel = v·(m·g·(sin θ + Crr·cos θ) + ½ρ·CdA·v²) = η·(P_rider + P_motor)
```

- `solveSpeed` bisects for v on each ≥ 50 m chunk of the profile (`gradeChunks`). Speed is
  capped at the bike's maximum descent speed and floored at walking pace.
- E-bike motor power = assist factor × rider power, capped at the motor limit. It tapers
  to 0 over the last 2 km/h before the cut-off speed (25 or 45 km/h).
- Battery Wh = motor energy / 0.8.
- Sanity check under test: a road bike at 200 W on the flat gives ≈ 32 km/h.

### Safety / surface (#11) — `lib/safety.ts`

- BRouter `messages` rows carry a `WayTags` column. `buildWaySegments` turns these into
  `{from, to, tags}` segments by distance.
- `classifySafety` returns one of:
  - **safe**: car-free ways, separated tracks, living streets, ≤ 30 km/h zones
  - **medium**: bike lanes, quiet roads
  - **exposed**: major roads without infrastructure, or ≥ 70 km/h
- MapView draws coloured runs above the active route. Message distances and geometry
  distances differ slightly, so runs are scaled to the geometry's total length.

### Places (#10)

- The route is simplified to ≤ 180 vertices before querying, giving a single Overpass query
  of the form `nwr[...](around.r:150, polyline)`.
- Results are cached per (signature, radius, categories).
- The query is debounced by 600 ms and aborted when the route changes.

### Live mode (#6) — `lib/live.ts`, `LiveHUD.tsx`

- `updateTracker` first snaps near the last matched segment (a windowed search), so
  overlapping out-and-back routes don't jump ahead.
- Off-route means the offset exceeds `max(40 m, GPS accuracy)` for 8 s. Progress freezes
  while off route.
- On reroute, App replaces the waypoints with `[My position, …remaining stops]`. Rerouting
  is limited to once per 30 s, out of respect for BRouter fair use.
- ETA blends model speed with the measured moving average after 1 minute of riding.
- The recorded track (with timestamps) can be exported as GPX from `RideSummary`.

### Mobile

- At ≤ 767 px the sidebar becomes a bottom sheet.
- The handle is a pointer-drag target: drag down more than 80 px to close (or collapse from
  full height), drag up more than 60 px to expand to 92 vh.
- In live mode the sheet is hidden and the HUD sits at the bottom of the screen.

---

## MapView (`src/components/MapView.tsx`)

| Effect trigger               | What it does                                                       |
|------------------------------|--------------------------------------------------------------------|
| `[]` (mount once)            | Create map + layer groups, click handler, ResizeObserver           |
| `[baseMap]`                  | `'auto'` runs the failover chain, otherwise loads the one provider |
| `[overlays]`                 | Add/remove overlay tile layers                                     |
| `[waypoints]`                | Rebuild all markers (A, B, C…; first dark, last red, via blue)     |
| `[routes]`                   | Draw halo+line per route; fit bounds (not in follow mode)          |
| `[activeRouteIdx, colorBy]`  | Re-style polylines; hide active line when class colouring is on    |
| `[activeRoute, colorBy]`     | Draw safety/surface runs                                           |
| `[pois]`                     | POI markers with DOM popups ("+ Add as stop")                      |
| `[userFix, follow]`          | Blue dot + accuracy circle; pan in follow mode                     |
| `[recenterNonce]`            | flyTo the user on the next fix                                     |

Gotchas:
- The layer picker was removed on purpose. It created duplicate tile layers on top of the
  failover layer. Basemap choice is now React state (sidebar "Map & layers").
- The `invalidateSize` timers **must** be cleared in cleanup. Under StrictMode the first map
  instance is removed immediately, and a late call throws `_leaflet_pos`.
- `.marker-pin` CSS must NOT include `transform: translate(…)`. It conflicts with Leaflet
  positioning.
- Leaflet listeners call handlers through refs that are updated every render.

---

## Routing profiles (`src/constants.ts`)

| UI label     | BRouter profile        | Default |
|--------------|------------------------|---------|
| Fastest      | `fastbike`             | ✓       |
| Low Traffic  | `fastbike-lowtraffic`  | ✓       |
| Balanced     | `trekking`             | ✓       |
| Car-free     | `trekking-nocar`       | ✓       |
| Safety       | `safety`               | ✓       |
| Shortest     | `shortest`             |         |
| Gravel       | `gravel`               |         |
| MTB          | `mtb-zossebart`        |         |

If a profile doesn't exist on the server, its request fails and the profile is silently
skipped. Verify new profile names against brouter.de before relying on them.

---

## Geographic coverage

```ts
BOUNDS_SW = [45.82, 5.95]   BOUNDS_NE = [47.81, 10.49]
NOMINATIM_VIEWBOX = '5.95,47.81,10.49,45.82'   // lon_min,lat_max,lon_max,lat_min
PHOTON_BBOX       = '5.95,45.82,10.49,47.81'   // lon_min,lat_min,lon_max,lat_max
```

---

## Styling

- Tokens are defined in `@theme`: `paper`, `ink`, `alpine`, `via`, `line` and others. Use the
  Tailwind utilities (`bg-paper`, `text-alpine`) rather than raw hex.
- Dynamic values use CSS variables: `--sidebar-width`, `--elevation-height`, `--route-color`.
- `.is-live` on `.app` hides decorative chrome (`.hide-live`) and the mobile sheet.

---

## Good test routes

- **Zürich HB → Affoltern am Albis**: the default; ~20 km with a real climb
- **Hauptbahnhof → Uetliberg**: heavy climb; good for watts and e-bike battery
- **ETH Zentrum → ETH Hönggerberg**: Fastest and Car-free diverge noticeably
- **Bellevue → Tiefenbrunnen**: flat lakeside; lots of fountains 💧
- **Bern → Thun**: longer route that shows profile deduplication
- **Geneva → Lausanne**: cross-canton; tests Switzerland-wide bounds

---

## Known gotchas

- **Sandbox tiles / APIs**: open the app from the dev server. In restricted sandboxes, mock
  the APIs (see "Testing without network").
- **BRouter out-of-bounds**: points in a lake or field return no route. Not a bug.
- **Profile deduplication**: identical tracks only show once. Silent by design.
- **Overpass rate limits**: HTTP 429 or 504 shows "Couldn't load places". The cache prevents
  repeat queries.
- **Geolocation** needs a secure context (HTTPS or localhost). iOS also needs a user gesture.
- **pnpm esbuild build scripts**: run `pnpm rebuild esbuild` once if Vite fails to start
  after a fresh install.
