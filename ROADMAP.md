# ZürichVelo — Roadmap & Specification

_Status as of 2026-11-04. Based on a review of the code on `main` (commit `027e535`), the
10 open issues (#2–#11) and the open Dependabot PR #12._

---

## 0. Progress log (updated as work lands)

### 2026-11-04 — v0.2.0 on `claude/admiring-cray-1pgp03`

| Item | Status | Notes |
|---|---|---|
| Phase 0: CI, Vitest, ESLint | ✅ | 47 unit tests on `src/lib/**`; CI runs lint, test and build |
| Phase 0: bug fixes | ✅ | stuck spinner, duplicate tile layers, search race, AbortController, StrictMode `_leaflet_pos`, dynamic map badge |
| Phase 0: Photon autocomplete, throttled Nominatim | ✅ | Nominatim only for reverse geocoding (≤ 1 req/s, cached) and as an Enter fallback |
| Phase 0: env keys, swisstopo/CyclOSM basemaps, chunk split | ✅ | `.env.example` |
| #8 URL params | ✅ | `?wp=…~name|…&p=…&map=…`, plus localStorage |
| #3 Current location | ✅ | Locate button, accuracy circle, heading arrow, "From here" |
| #5 Pace toggle / #4 Watts | ✅ | Physics model; e-bike battery % with warnings |
| #2 Multiple waypoints | ✅ | Add, remove, reorder, reverse. **Drag-the-line-to-insert not done yet** |
| #6 Live mode | ✅ MVP | HUD, off-route reroute, wake lock, ride GPX. No voice yet |
| #10 Stopovers / find closest | ✅ | 12 POI categories via Overpass; "+ stop" inserts at the right place |
| #11 Segmentation | ✅ partial | Safety and surface colouring + % bar. **Accident hotspots and crossing count not done** |
| #7 Swipe sheet | ✅ | Drag handle: expand, collapse, dismiss |
| Bike-network overlays | ✅ | Veloland, Mountainbikeland, Waymarked Trails |
| #9 Scenic / time-boxed loops | ⏳ | Next. Specced below |

**Verification caveat:** the build sandbox couldn't reach brouter.de, Photon, Overpass or
the tile servers. The UI was tested end to end in headless Chromium with those APIs mocked.
Check these against the real services:
- swisstopo WMTS URLs (`ch.swisstopo.pixelkarte-farbe`, `ch.astra.veloland`, `ch.astra.mountainbikeland`)
- BRouter profiles `gravel` and `mtb-zossebart`
- the BRouter `messages` WayTags column on real routes

### Next up (auto-pilot queue)

1. **#9 Time-boxed loop generator**: "2 h loop from here passing a fountain".
2. **Drag-to-insert via point** on the route line (finishes #2).
3. **Climb list** in the elevation panel: categorised climbs, click to zoom.
4. **Weather & wind** from Open-Meteo: headwind component per route, rain at ETA.
5. **PWA**: installable, offline app shell, cache the route corridor's tiles before a ride.
6. **Playwright smoke test** in CI with mocked APIs. A local script already exists in the
   sandbox; port it to the repo.
7. **Accident hotspots** (#11 remainder), once the geo.admin.ch layer ID is verified.
8. **Voice turn-by-turn**: check BRouter `timode` voice hints and the Web Speech API.

---

## 1. Where the project stood (review of `027e535`, before v0.2.0)

### What works well

- A clean, small codebase (~1.6k lines) with one state owner (`App.tsx`) and imperative
  Leaflet/Chart.js wrappers. Easy to extend.
- Five BRouter profiles fetched in parallel, de-duplicated, with an elevation chart
  synced to the map.
- GPX export, reverse geocoding, draggable pins, resizable panels, tile failover.
- A mobile bottom sheet already exists (CLAUDE.md still lists it as future work).
- `pnpm build` passes under strict TypeScript.

### Quality check: what's missing

| Area | Finding | Severity |
|---|---|---|
| Tests | No unit, component or E2E tests. Pure helpers (`buildElevationProfile`, `computeSignature`, `haversine`) are easy to test but aren't. | High |
| CI | No GitHub Actions. Dependabot PRs are merged without a build check. | High |
| Linting | No ESLint or Prettier config. | Medium |
| **Nominatim policy** | `SearchInput` calls Nominatim as you type (300 ms debounce). Nominatim's usage policy forbids client-side autocomplete and allows at most 1 req/s. This can get the app blocked. | High |
| Bug: stuck spinner | Clearing a point while routes are loading leaves `loading = true`. The effect's early-return branch never resets it (`App.tsx`, route-fetch effect). | Medium |
| Bug: double tile layer | The layer picker creates *separate* `TileLayer` instances. Choosing one leaves the auto-failover layer on the map underneath (`MapView.tsx`). | Medium |
| Bug: search race | Results from an older debounced Nominatim request can overwrite newer ones. `geocode()` also doesn't check `r.ok`. | Low |
| Wasted requests | In-flight BRouter fetches aren't aborted (only a `cancelled` flag). Dragging a pin fires 5 new requests each time. Use `AbortController`. | Low |
| Hard-coded UI | The map badge always reads "Zürich · 47.37°N 8.54°E", even when the user is in Geneva. | Low |
| Touch | The sidebar and elevation resize handles only respond to mouse events, not touch or pointer events. | Low |
| Accessibility | `RouteCard` is `role=button` but ignores Space, and it contains a nested button. No ARIA labels on map controls. | Low |
| Config | Tile API keys are hard-coded in `src/constants.ts`. They should come from `import.meta.env.VITE_*`. | Low |
| Odd shim | `src/constants.js` re-exports `constants.ts`. This is unnecessary with Vite + TS and confusing. Delete it. | Low |
| Repo hygiene | `image.png` (2.5 MB) and the legacy prototype `zurich_velo.html` sit in the repo root. Move them to `docs/` and compress, or delete them. | Low |
| Docs drift | README and CLAUDE.md say React 18 / Vite 5, but the app uses React 19 / Vite 6. There's a typo "Affoltern am Alibis". The mobile sheet is listed as "future". | Low |
| Bundle | The 526 kB JS chunk triggers a Vite warning. Lazy-load Chart.js and later the live-mode code. | Low |
| No persistence | Nothing survives a reload: points, basemap and profile are lost. Covered by #8. | Medium |

---

## 2. Roadmap at a glance

| Phase | When | Theme | Issues |
|---|---|---|---|
| **0** | Week 1 | Hygiene: CI, tests, lint, bug fixes, policy-safe geocoding | — |
| **1** | Weeks 2–3 | Quick wins: shareable URLs, my location, speed toggle, multi-waypoints | #8, #3, #5, #2 |
| **2** | Weeks 4–6 | **Live mode MVP**: GPS tracking, progress, off-route reroute | #6 |
| **3** | Weeks 6–8 | **POIs & overlays**: fountains, repair, e-bike charging, bike-path layers, stopovers | #10 |
| **4** | Weeks 8–10 | **E-bike & power**: e-bike profiles, watts, battery estimate | #4, (#5) |
| **5** | Weeks 10–12 | Route segmentation: safety and surface colouring, accident hotspots | #11 |
| **6** | Weeks 12–14 | Mobile polish & PWA: swipe sheet, offline, install | #7 |
| **7** | Later | Scenic / time-boxed loops, turn-by-turn voice, Strava-style extras | #9 |

The order is chosen for dependencies. URL state (#8) and multi-waypoints (#2) come
before stopovers (#10) and scenic loops (#9). Geolocation (#3) comes before live mode
(#6). The segment parser (Phase 5) reuses the BRouter `messages` parsing from Phase 4.

---

## 2a. Your open issues — triage

State on GitHub: 10 open issues, all created 15–16 Jun 2026. None have labels or
comments. Eight have a title only. #9, #10 and #11 have one line each. #11 is the only
unassigned issue.
Suggested labels: `phase:0`–`phase:7`, `size:S/M/L`, `area:map`, `area:live`,
`area:routing`, `area:mobile`.

| # | Title (as filed) | What's in the issue | Phase | Size | Priority | Depends on |
|---|---|---|---|---|---|---|
| #8 | Add Url Query Params | title only | 1 | S | **P1** | — (but plan the format for #2) |
| #3 | Option to show the current location on the map | title only | 1 | S | **P1** | — |
| #5 | Toggle estimated average km/h per route | title only | 1 | S | P2 | — |
| #2 | Option to add multiple waypoints | title only | 1 | L | **P1** | #8 (URL format) |
| #6 | Add live mode | title only | 2 | L | **P1** | #3 |
| #10 | Live Mode: Add Stopovers | "Find closest: shops, gas station, fountains, hotels, restaurants etc." | 3 | M | P1 | #2, #6 |
| #4 | show watt output per route | title only | 4 | M | P2 | #5 (shared speed/physics model) |
| #11 | Show detailed Route segmentation | safe / medium / not-so-safe segments, bike paths, crossings, accident hotspots | 5 | M | P2 | — (reuses the Phase 4 parser) |
| #7 | Mobile mode: Hide overlay by swiping | title only | 6 | S | P2 | — (can be pulled forward) |
| #9 | Scenic Waypoints & Route automation | "route up to 2 hours + modifier: I want to see a waypoint, fountain…" | 7 | L | P3 | #2, #5, #10, #11 |

### Per-issue spec and acceptance criteria

Paste these into the issue bodies so each issue has a clear "done".

**#8 — URL query params**
- Encode the waypoints, active profile, active route index and basemap, e.g.
  `?wp=47.3773,8.5374|47.2752,8.4528&p=trekking&map=swisstopo`.
- [ ] Opening a shared link restores the exact same routes and selection.
- [ ] The URL updates with `replaceState` on every change, without adding history spam.
- [ ] Invalid or out-of-bounds params fall back to the defaults without crashing.
- [ ] A "Copy link" button exists.
- Use a **list** of waypoints (`wp=`), not `a=` / `b=`, so #2 doesn't break old links.

**#3 — Current location**
- [ ] A locate button shows a blue dot with an accuracy circle, and the map recentres on it.
- [ ] The button offers "Use as start (A)".
- [ ] Permission denied or timeout shows a friendly message.
- [ ] Location outside Switzerland shows a message instead of a broken route.
- The `useGeolocation` hook it introduces is the base for #6.

**#5 — Average km/h toggle**
- Interpretation: let the user set their own pace, and show time and average speed per route
  from that pace instead of BRouter's fixed estimate.
- [ ] Speed presets (15 / 20 / 25 / custom) are saved in `localStorage`.
- [ ] Each route card shows "Ø xx km/h" and the time at that pace.
- [ ] The time adjusts for gradient (uphill slower), using the same model as #4.
- [ ] A toggle switches between "BRouter estimate" and "my pace".

**#2 — Multiple waypoints**
- [ ] The data model changes from `pointA` / `pointB` to `waypoints: Point[]`.
- [ ] The BRouter call uses `lonlats=a|b|c…`.
- [ ] You can add a stop, remove a stop and reorder by dragging in the sidebar.
- [ ] Dragging the route line on the map inserts a via point.
- [ ] Pins are labelled A, B, C…
- [ ] GPX export and the URL (#8) include all waypoints.
- This is the largest refactor, and it unblocks #10 and #9.

**#6 — Live mode**
- The full spec is in Phase 2 below.
- [ ] "Start ride" opens a fullscreen HUD showing speed, distance left, ETA, climb left and the next notable item.
- [ ] The map follows the position, and the elevation chart shows progress.
- [ ] Going off-route for more than 40 m for more than 8 s triggers an automatic reroute.
- [ ] The screen stays on (Wake Lock).
- [ ] The ride can be saved as GPX.
- Covers fountains, bike paths and e-bikes as asked in chat: the POI part is #10, the
  overlay part is Phase 3, and e-bike support is Phase 4.

**#10 — Stopovers (find closest)**
- The issue lists shops, gas stations, fountains, hotels and restaurants. Also add: repair
  stations, e-bike charging, toilets, train stations and bike parking. The OSM tag
  mapping is in Phase 3.
- [ ] "Find closest ▸ category" ranks results by distance **ahead along the route**
  (not straight-line) and shows the detour in km and minutes.
- [ ] "Add as stop" inserts the place as a waypoint (needs #2) and reroutes.
- [ ] It works in planning mode too, not only in live mode.
- [ ] Overpass results are cached per route, with no more than one query per route change.

**#4 — Watt output**
- [ ] A rider profile stores bike type and system mass.
- [ ] Each route card shows average watts, kJ and kcal at your pace (#5), or the time at a given wattage.
- [ ] The elevation chart tooltip shows the power needed at the hovered point.
- [ ] For e-bikes, it shows estimated battery % and warns if the battery won't last the route.
- Unit-test the physics against a known reference, e.g. 75 kg + 10 kg at 200 W on flat
  ground ≈ 30 km/h on a road bike.

**#11 — Route segmentation**
- [ ] Parse BRouter `WayTags` per segment and classify each as safe, medium or exposed.
  The rules are in Phase 5.
- [ ] A "Colour by safety" toggle colours the line on the map.
- [ ] Each route card shows a % bar.
- [ ] Crossings and traffic signals are counted.
- [ ] An optional accident-hotspot overlay comes from ASTRA/geo.admin.ch data.
- [ ] A legend explains the classes.
- Assign this issue — it's the only unassigned one.

**#7 — Swipe to hide overlay**
- [ ] The bottom sheet has three snap points (peek / half / full) and follows the finger during a drag (pointer events).
- [ ] A fast flick snaps to the next point.
- [ ] The map stays usable while the sheet is at peek.
- This is small and independent, so it can be done in Phase 1 for a quick mobile
  improvement.

**#9 — Scenic waypoints & route automation**
- Interpretation: "Give me a route of at most 2 h (or N km) from here, optionally a loop,
  that passes things I care about (fountain, viewpoint, lake, café)."
- [ ] Input: start point, time or distance budget, loop or A→B, and a "must include" list of categories.
- [ ] Output: 3 candidate routes, each with the scenic POIs it passes listed.
- [ ] Every candidate fits within ±10 % of the budget.
- Algorithm sketch is in Phase 7. It depends on #2, #5, #10 and #11.
- Consider splitting into **#9a time-boxed loop** and **#9b must-pass POIs**.

### Gaps: work not covered by any issue (suggest opening)

1. CI + tests + lint (Phase 0)
2. Nominatim autocomplete policy violation, switch to Photon (Phase 0)
3. Bug: loading spinner stuck after clearing a point during a fetch
4. Bug: layer picker leaves the auto tile layer underneath
5. Bike-path overlays (Veloland / SchweizMobil, CyclOSM) — mentioned in chat, no issue yet
6. E-bike routing profiles and battery estimate — mentioned in chat, no issue yet. Could
   be a sub-issue of #4.
7. Profile picker (choose which of the 5+ profiles to fetch)
8. Merge Dependabot PR #12 (vite 6.4.2 → 6.4.3) once CI exists

---

## 3. Phase details & specifications

### Phase 0 — Foundations (week 1)

1. **CI**: add `.github/workflows/ci.yml` with `pnpm install --frozen-lockfile`,
   `pnpm lint`, `pnpm test` and `pnpm build` on every PR. This lets Dependabot PRs
   such as #12 merge safely.
2. **Vitest**: add unit tests for `buildElevationProfile`, `computeSignature`, `haversine`
   and a GPX serialiser (extract `downloadGPX`'s string building into a pure `toGPX()`).
   Store recorded BRouter fixtures in `src/__fixtures__/`.
3. **ESLint + Prettier**: use `typescript-eslint` and `eslint-plugin-react-hooks`.
4. **Bug fixes** from the table above: stuck spinner, double tile layer, search race,
   `AbortController`, dynamic map badge.
5. **Geocoding**: switch autocomplete to **Photon** (`photon.komoot.io`, built for
   type-ahead, OSM-based, supports `bbox` and `lang=de`). Keep Nominatim only for
   reverse geocoding, throttled to ≤1 req/s.
6. **Env-based keys**: `VITE_THUNDERFOREST_KEY` and `VITE_MAPTILER_KEY`, with a
   `.env.example` file.
7. **Free Swiss basemaps** (no key needed): swisstopo WMTS from `wmts.geo.admin.ch`, such
   as `ch.swisstopo.pixelkarte-farbe` and `ch.swisstopo.swissimage`. These are the best
   maps for Switzerland and are open data. Add them to `TILE_PROVIDERS`.
8. **Refactor `App.tsx`**: move route fetching into `src/services/brouter.ts` and a
   `useRoutes(points)` hook, and geocoding into `src/services/geocode.ts`. This makes
   room for live mode without growing `App.tsx` further.

### Phase 1 — Quick wins (weeks 2–3)

#### #8 URL query params

- Format: `?wp=47.3773,8.5374|47.2752,8.4528&p=trekking&r=1&map=swisstopo`.
  `wp` is an ordered waypoint list, `p` the active profile, `map` the basemap.
- Read the URL on load. Write it with `history.replaceState` when state changes.
- Also store the last session in `localStorage` as a fallback when there are no params.
- Add a "Copy link" button in the sidebar.

#### #3 Show current location

- Add a `useGeolocation()` hook wrapping `navigator.geolocation.watchPosition`
  (`enableHighAccuracy: true`).
- Draw a blue dot plus an accuracy circle. Add a locate button that recentres the map
  and offers "Use as start".
- Note that geolocation requires HTTPS, which matters on iOS.

#### #5 Average speed toggle

- Add a speed preset to the sidebar: _Leisure 15 · Normal 20 · Sport 25 · E-bike 25+ · Custom_.
- Recompute duration from the elevation profile using a simple grade-adjusted model,
  instead of BRouter's `total-time`. Show both values: "BRouter est." and "Your pace".

#### #2 Multiple waypoints

- Change the data model from `pointA` / `pointB` to `waypoints: Point[]` (min 2).
- BRouter already accepts `lonlats=a|b|c|…`.
- UI: an "Add stop" button, reorderable list, and drag-to-insert (drag the route line to
  create a via point). Letters A, B, C… on the pins.
- **This is the biggest refactor in the plan.** It touches `App`, `MapView`, `Sidebar` and
  the URL format, so do it before anything that adds stops.

### Phase 2 — Live mode MVP (weeks 4–6) — #6

**Goal:** ride with the app open on a handlebar-mounted phone.

#### UX

- A "Start ride" button on the active route card switches the app into `mode: 'live'`.
- The sidebar collapses into a heads-up display (HUD):
  - current speed
  - distance remaining
  - ETA
  - climb remaining (m ↑)
  - next notable item, e.g. "Fountain in 1.2 km" or "Climb 6 % for 800 m in 300 m"
- The map follows the rider, with optional heading-up rotation.
- The elevation chart shows a progress cursor and a shaded "done" section.
- The **Wake Lock API** keeps the screen on, and the ride ends with a summary card.

#### Logic (`src/live/`)

| Module | Responsibility |
|---|---|
| `useGeolocation` | Shared with #3. Smooths jittery fixes (drop accuracy > 50 m, simple Kalman or EMA filter). |
| `snapToRoute(pos, coords)` | Projects onto the nearest polyline segment. Returns `{ distAlong, offsetM, segIdx }`. Use a spatial index (flatbush) for long routes. |
| `progress` | Remaining distance and ascent from cumulative arrays precomputed when the route loads. ETA uses the rolling average speed. |
| `offRoute` | Triggers when `offsetM > 40 m` for more than 8 s. Reroutes current position → remaining waypoints with the same profile, at most once per 30 s (BRouter fair use). |
| `rideLog` | Records the track and can be exported as GPX ("ridden track", with timestamps). |

#### Non-goals for the MVP

Voice turn-by-turn (Phase 7) and background tracking with the screen off (not
possible in a web app without a native wrapper).

**Privacy:** location never leaves the device, except as the start coordinate of a
reroute request to BRouter. State this in the UI.

### Phase 3 — POIs, bike-path overlays & stopovers (weeks 6–8) — #10

#### POI layer

Query the **Overpass API** for a corridor along the active route. Simplify the route to
about 150 points, then use `around.r:150` with the polyline coordinate list. Cache results
per route signature.

| Category | OSM tags | Notes |
|---|---|---|
| 💧 Fountains / drinking water | `amenity=drinking_water`, `amenity=fountain` + `drinking_water=yes` | Switzerland has thousands. Zürich alone has 1,200+ public fountains (city open data "Brunnen" can supplement OSM). Hide `drinking_water=no`. |
| 🔧 Repair stations | `amenity=bicycle_repair_station`, `shop=bicycle` | Show opening hours (`opening_hours`). |
| 🔌 E-bike charging | `amenity=charging_station` + `bicycle=yes`, `amenity=charging_station` + `socket:*` | Also an e-bike filter in Phase 4. |
| 🅿️ Bike parking | `amenity=bicycle_parking` | Covered / capacity tags. |
| 🚲 Bike sharing | `amenity=bicycle_rental` | PubliBike / Velospot stations. |
| 🚻 Toilets, ☕ cafés, 🛒 supermarkets, 🏨 hotels, ⛽ fuel shops | `amenity=toilets`, `amenity=cafe`, `shop=supermarket`, `tourism=hotel`, `amenity=fuel` | Covers what issue #10 asks for. |
| 🚆 Train stations | `railway=station` | Bail-out points. SBB lets you take your bike on trains. |

- **UI:** category chips above the route list toggle markers. A "Along this route" list is
  sorted by distance-along-route, using `snapToRoute` from Phase 2.
- **Live mode:** "Find closest ▸ water / repair / charging / food". This ranks by
  distance ahead on the route, not straight-line distance.
- **Stopover:** tap a POI → "Add as stop" inserts it as a waypoint at the right position
  (needs #2). Show the detour cost (Δ km / Δ min) computed with one extra BRouter call.

#### Bike-path overlays

Toggleable overlays that sit on top of any basemap:

- **SchweizMobil / Veloland national, regional and local cycling routes** via swisstopo
  WMTS (`ch.astra.veloland` family on `wmts.geo.admin.ch`).
- **Mountain-bike routes** (`ch.astra.mountainbikeland`).
- **Waymarked Trails – Cycling** (`tile.waymarkedtrails.org/cycling`) for OSM route
  relations.
- **CyclOSM** as an optional basemap, because it shows lanes, tracks and surface.

### Phase 4 — E-bike & power (weeks 8–10) — #4, #5

#### Rider profile (stored in `localStorage`)

- bike type: road / trekking / MTB / e-bike 25 / S-pedelec 45
- rider + bike mass
- typical power or target speed
- for e-bikes: battery capacity (Wh) and assist level

#### Physics model (`src/physics.ts`)

For every profile segment:

```text
P = v · ( m·g·(sin θ + Crr·cos θ) + ½·ρ·CdA·v² ) / η_drivetrain
```

Default values per bike type:

| Bike type | Crr | CdA |
|---|---|---|
| Road | 0.004 | 0.32 |
| Trekking | 0.006 | 0.45 |
| MTB | 0.010 | 0.50 |

- Solve for `v` given rider power, or for `P` given target speed.
- Cap descents at a safe maximum speed (about 45 km/h).

#### Outputs per route card

- average and normalised power (W)
- kJ / kcal
- time at your pace (#5)
- for e-bikes:
  - estimated battery use in Wh and % ("~62 % battery"), where motor share = assist ratio × rider power, capped by the motor limit
  - a warning when the route exceeds the battery's range
  - charging POIs highlighted (Phase 3)

#### E-bike routing

- Add BRouter profiles in `PROFILES`. Check which are available on brouter.de (the
  README mentions `electric`, `mtb` and `gravel`; verify each one).
- If a profile isn't available, upload a custom profile through BRouter's
  `profile upload` endpoint. A custom e-bike profile can penalise climbs less and avoid
  paths where S-pedelecs aren't allowed.
- S-pedelecs (45 km/h) are legally mopeds in Switzerland. Add a legal-notice tooltip
  and a profile that respects `mofa=no` / `moped=no` tags.
- **Profile picker**: let the user enable or disable profiles instead of always fetching
  all 5. This cuts load on BRouter and makes room for e-bike, gravel and MTB.

### Phase 5 — Route segmentation & safety (weeks 10–12) — #11

BRouter `messages` rows include `WayTags` per segment, e.g. `highway=secondary
cycleway=lane surface=asphalt maxspeed=50`. Parse them into segments.

#### Classifier

| Class | Rule |
|---|---|
| **Safe** (green) | `highway=cycleway`, `cycleway=track`, `bicycle=designated` paths, `highway=living_street`, or residential with `maxspeed≤30` |
| **Medium** (amber) | Painted `cycleway=lane`, or quiet tertiary/unclassified roads with ≤50 km/h |
| **Exposed** (red) | Primary/secondary without bike infrastructure, `maxspeed≥60`, or busy roundabouts |

- Show a **surface** sub-layer: asphalt / gravel / unpaved.

#### UI

- A "Colour by: profile · safety · surface · gradient" toggle on the map line.
- A stacked bar on each route card, e.g. "72 % safe · 20 % medium · 8 % exposed".
- The elevation chart background is tinted by class.

#### Accident hotspots

- Overlay of ASTRA road-accident data from geo.admin.ch, filtered to accidents involving
  bicycles. Confirm the exact layer ID in the geo.admin.ch layer catalogue before
  building on it.
- Cluster accidents within 30 m of the route and list them as "⚠ hotspots on this
  route".

**Crossings:** count `highway=crossing` and `traffic_signals` nodes along the route as an
"interruptions" metric.

### Phase 6 — Mobile & PWA (weeks 12–14) — #7

- **Swipeable bottom sheet** (#7) with three snap points (peek / half / full) using pointer
  events. Swipe down hides it. The map stays interactive in peek mode.
- **PWA**: add `vite-plugin-pwa` with a manifest, install prompt and app-shell caching.
- **Offline**: cache the active route, POIs and tiles in the route corridor (zoom 12–16)
  in Cache Storage before a ride. Respect each tile provider's terms; swisstopo and OSM
  have different rules on bulk prefetching.
- Pointer/touch support for all resize handles. Larger touch targets in live mode.
- **Dark / night mode** for evening rides.

### Phase 7 — Later / exploratory — #9 and more

- **Scenic & time-boxed loops (#9)**: "Give me a 2 h loop from here that passes a lake and
  a fountain."
  - Approach: generate candidate via points on a ring whose radius comes from target time × pace.
  - Bias the via points toward POIs or scenic features (`natural=water`, `tourism=viewpoint`, Veloland routes).
  - Route each candidate through BRouter and score it by duration fit, scenic POIs passed and safety share.
  - Return the top 3. Needs #2, Phase 3 and Phase 5.
- **Turn-by-turn & voice** in live mode: BRouter can return voice hints (`timode`
  parameter). Spoken with the Web Speech API (`speechSynthesis`, German and English).
- **Weather & wind**: wind direction and speed along the route from Open-Meteo (free, no
  key). Adjust the power model for headwind, and warn about rain at ETA.
- **Public-transport combo**: "Ride to the nearest SBB station" bail-out in live mode,
  using opendata.transport.opendata.ch.
- **GPX/FIT import**: show and edit an existing track, and compare it with the generated
  routes.
- **Saved routes & history**: local first. Optional sync later (a Supabase or simple
  backend would also allow sharing beyond URLs).
- **Own BRouter instance**: if usage grows, self-host BRouter with Swiss segments (a Docker
  image is available) to avoid fair-use limits on brouter.de.
- **i18n**: DE / FR / IT / EN to match Switzerland's languages.

---

## 4. Ideas backlog (unscheduled)

- "Avoid climbs" slider: penalise ascent using BRouter profile parameters, which can be
  overridden in the URL for custom profiles.
- Gradient heat colouring of the route line, plus a "steepest 100 m" callout.
- Compare mode: overlay two routes' elevation profiles in one chart.
- Arrival time picker ("I need to be there at 9:00, when do I leave?").
- Kid / family mode: Safety profile, max gradient 6 %, more frequent playground stops.
- Shareable ride summary image after live mode, rendered with canvas.
- Lights-on reminder based on sunset time at ETA.

### Brainstorm round 2 (after v0.2.0)

**Riding & safety**
- **"Quiet hours" routing**: penalise exposed segments more at rush hour. Use the time of
  day to pick between `safety` and `fastbike`.
- **Tunnel / bridge warnings** in live mode (`tunnel=yes`, `bridge=yes`, often no shoulder).
- **Tram tracks ⚠**: Zürich's tram rails are a top cause of cycling crashes. Flag segments
  with `railway=tram` sharing the road, and count tram-track crossings per route.
- **Steepest-section badge** on each card ("max 14 % for 120 m"). This matters for kids'
  trailers and cargo bikes.
- **Cargo-bike / trailer mode**: max gradient, avoid steps and barriers
  (`barrier=cycle_barrier`), wider-path preference.
- **Night mode**: prefer lit ways (`lit=yes`) after sunset, and show the share of the route that is lit.

**E-bike**
- **Range rings**: "where can I get on 60 % battery and back?" Compute an isochrone with
  BRouter's range or isochrone support (verify it's available) or a sampled ring of routes.
- **Charge-stop planner**: if battery % > 100, automatically insert the best charging stop.
- **Assist optimiser**: suggest Eco on the flat and Turbo only on the climbs to make the
  battery last.

**Social & data**
- **Ride history** saved locally (IndexedDB), with personal records on recurring segments.
- **Compare a recorded ride to the plan**: where did you deviate, and were you faster than
  the model? Use this to auto-calibrate the rider's watts.
- **Share a ride card** image (canvas) with the route, stats and elevation.
- **Fountain quality**: show `drinking_water:legal`, seasonal flags, and the city of Zürich's
  open-data fountain list (more complete than OSM in Zürich).

**Multimodal**
- **"Bail-out" button** in live mode: route to the nearest train station and show the next
  departures (transport.opendata.ch). Bike-ticket reminder.
- **Ride one way, train back**: plan an outbound ride and pick the return train from the
  destination.

**Developer experience**
- **Mock-API dev mode** (`VITE_MOCK=1`) serving fixture routes, so UI work doesn't depend
  on public APIs.
- **Storybook-style gallery** of RouteCard, LiveHUD and RiderPanel states.
- **Lighthouse CI** for mobile performance and accessibility budgets.

---

## 5. Definition of done (applies to every phase)

- `pnpm lint && pnpm test && pnpm build` is green in CI.
- New pure logic (physics, snapping, classifier, URL codec) has unit tests.
- Works at 375 px width and on desktop.
- README and CLAUDE.md are updated in the same PR.
- External APIs are used within their usage policies: BRouter, Overpass and Nominatim
  fair use; tile provider terms.
