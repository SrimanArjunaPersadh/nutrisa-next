# PHASE 3 DECISIONS — Weight tab

**Date: 2026-08-03 · Branch: `phase-3-weight` · Owner + Claude Code**

Decisions taken during the Phase 3 interview, before any code was written. The
Migration Plan remains the authority; where this file amends it, the amendment is
recorded here and in the Plan's changelog.

All line numbers refer to `docs/reference/old-index.html`. Its weight surface is
`vW()` at 2982–3104, the filter `fW()` at 565–598, the chart builder `bDS()` at
3656–3669, the chart init `wC()` at 3749–3753, and `delW()` at 3633–3638.

This is the FIRST phase that ships a surface, so several rulings below set
precedent for Phases 4–8, not just for Weight.

---

## 1. The old chart has NO trend line. We add one. Plan §5.3 wins.

**Found:** `bDS()` builds exactly three datasets — Daily weight (`#0066FF`, filled,
per-point colours), Target −0.5kg/wk (`#F59E0B`, dashed `[5,4]`), 88kg goal
(`#22C55E`, dashed `[3,6]`). The trend appears only in the Trend Weight tile (3021)
and under each history row (3093). It has never been drawn as a line.

Plan §5.3 specifies "raw daily chart + trend line + target projection + 88kg goal
line". The Plan is describing a chart the old app does not have.

**Ruling: add the trend line.** Plan §5.3 wins over the old screen here. §6 calls the
trend "the truth the app defends"; a chart that omits it argues against the app's own
thesis. Values come from `trendWeight(ALL)` and are then sliced to the visible
window — never recomputed from the slice (see §2).

This is an ADDITION to a translated surface and therefore needs this dated note to
satisfy the "no invented features" rule (Plan §3). It is the only addition in
Phase 3.

## 2. The chart-zoom fix was only HALF applied in the old app. We finish it.

**Found:** `vW()` applies the fix correctly for the tiles and the history list —
`fullTrend = tL(all)` at 2985, then the last filtered date is looked up inside that
full array (2989–2991), and the weekly rate walks back through `fullTrend`
(2993–3001).

But `wC()` calls `bDS(fW())` — the FILTERED slice — so inside `bDS`:

```js
const first = data[0].w, fd2 = new Date(data[0].date);
const tgt = data.map(x => +(first - RATET * Math.round((new Date(x.date)-fd2)/864e5)).toFixed(2));
const ptC = data.map((x,i) => i===0 ? BLUE : x.w<data[i-1].w ? GREEN : x.w>data[i-1].w ? RED : BLUE);
```

Both anchor to `data[0]` of the VISIBLE window. Switching to Week re-anchors the
amber target line to this week's first weigh-in instead of the all-time start, and
the first visible dot is always blue rather than compared to its true predecessor.

**Ruling: fix both, per Plan §5.3.** `targetLine` anchors to the all-time first
weigh-in; dot colours compare each point to its true predecessor across the full
series, then slice. The amber line no longer jumps when the filter changes.

**This deliberately diverges from the old app's rendered pixels.** It is not an
oracle violation: no stored Supabase value changes, and every NUMBER (tiles, history,
trend, rate) still reproduces the old app exactly. Only the chart's target-line
anchor and one dot colour differ, and Plan §5.3 explicitly asks for that difference.

## 3. Scope — the WHOLE weight page ships in Phase 3

Plan §5.3's one-line summary (chart + filter + history + date picker) undersells the
surface. The real page is:

| Block | Source | Notes |
|---|---|---|
| Tiles: Current · Trend Weight · Change · Weekly Rate | 3019–3027 | Current is latest of ALL; the rest are filtered |
| Chart card: Week/Month/All/Custom, month input, range picker, legend | 3028–3051 | |
| Tiles: Average · Minimum · Maximum · To Goal | 3052–3057 | To Goal's subtitle is the ETA string |
| Log Weight card + Weigh-In Protocol + Weekly Averages | 3058–3081 | |
| History card | 3082–3103 | delta, trend, delete per row |

**Ruling: all of it.** None of this is invented — it all exists in the old app — and
Phase 3's verify step is a side-by-side numeric comparison, which a partial page
cannot support.

**Carried-forward quirk:** the Current tile reads `lw()` (2986) — the latest entry of
the FULL series — while Change / Average / Min / Max read the filtered set. Filter to
a past month and Current still shows today's weight. Deliberate; do not "fix".

## 4. Chart.js via npm, tokens not hex

**Ruling: `npm i chart.js`.** Same library as the old app's CDN 4.4.0, installed as a
dependency so the service-worker shell and CSP stay coherent (the old CDN tag at
line 13 does not carry forward). The dataset config ports nearly verbatim.

Colours are read from the live CSS custom properties — `--blue`, `--green`, `--red`,
`--amber`, `--text-1`, `--text-3` — via `getComputedStyle`, never re-typed as hex.
This is exactly why Phase 0 aliased the bare names in `:root` as `var()` references.
**No hex enters any `.ts`/`.tsx` file**; the `tests/tokens.test.ts` file list is
unchanged by this phase.

## 5. Trend takes `--blue`; raw daily fades to `--text-3`

With a trend line added (§1), two lines cannot both own the primary colour.

**Ruling:**

| Dataset | Colour | Width | Style |
|---|---|---|---|
| Daily weight | `--text-3` | 1.2px | line + per-point colours kept |
| **Trend** | `--blue` | 2.2px | solid, no points |
| Target −0.5kg/wk | `--amber` | 1.5px | dashed `[5,4]` |
| 88kg goal | `--green` | 1px | dashed `[3,6]` |

The trend becomes the loudest line on the chart and raw daily recedes to context —
"trend, not noise" (§5.3) made literal. The per-point green/red/blue dots stay: they
are the day-to-day signal, and they still carry the §4 semantic meanings.

The legend (3046–3050) gains a fourth item and its swatches read the same tokens.

## 6. Delete gets an Undo toast, not a confirm

**Found:** `delW()` (3633) deletes on a single tap with no confirmation.

**Ruling: keep the single tap, add an Undo toast.** The toast names what went
(`Deleted 27 Jul · 96.8kg`) and offers Undo for a few seconds; Undo calls
`logWeight(date, weight)` again, which upserts on `date` and restores the row
exactly (`lib/data/weights.ts`).

Rationale: a confirm dialog taxes every delete to guard against a rare fat-finger,
and this is a phone-first app. §4.4 forbids silent reverts — an Undo toast is the
opposite of silent, and it is recoverable rather than merely cautious. The toast is
also the delete path's ERROR surface: a failed delete says so in the same slot.

## 7. shadcn/ui gets installed HERE

Phase 0 deferred shadcn to "the phase that first needs a primitive". The date picker
and the custom range picker are that need.

**Ruling: `shadcn init` + `add calendar popover` in this branch.** Its
`--background`/`--primary`/etc. are mapped onto our tokens in `globals.css` as
`var()` references — **no new hex, and the §4 names stay canonical**. Phases 4 and 5
need dropdowns and dialogs anyway, so the mapping is paid for once here.

**The dropdown rule still governs.** shadcn's Popover handles blur-before-click
correctly, which is the sanctioned escape hatch in the rule's own wording. Any
day-cell we hand-render inside it uses `onMouseDown` + `preventDefault()`, never
`onClick`. Click-outside-to-close, Enter = select, Escape = close, 44px targets.

### 7a. HOW it was installed (2026-08-04) — `init` was NOT run

`npx shadcn init` rewrites the target stylesheet with its own palette block. Ours
is guarded by `tests/tokens.test.ts` ("every hex exactly once", "the alias block
contains no hex at all"), and a second palette would defeat the point of §4 even
where it uses `oklch()` rather than hex.

**So `components.json` was hand-written and only `shadcn add popover calendar` was
run.** `git diff` confirms it touched no CSS: it created
`components/ui/{popover,calendar,button}.tsx` and added `radix-ui`,
`react-day-picker` and `date-fns`. `clsx`, `tailwind-merge`,
`class-variance-authority` and `tw-animate-css` were added by hand (the generated
files import `cn`, `cva`, and Popover's enter/exit animation utilities).

The name mapping lives in `@theme` in `globals.css` — `--color-primary:
var(--color-blue)`, `--color-popover: var(--color-bg2)`, and so on. **Every value
is a `var()` reference; no hex is re-typed and the token tests still pass.**
`--color-border` already existed and is exactly what shadcn means by `border`, so
it is NOT redeclared. Read the block as: *when shadcn says primary, it means our
blue.*

`lib/utils.ts` (`cn`) is shadcn's by convention — nothing in `lib/engine` or
`lib/data` should ever import it.

### 7b. Two components, both ported from the old app

- **`components/date-picker.tsx`** ← `renderDatePicker` (2882–2918). Popover +
  Calendar, Monday-first, today and selection marked, opens on the selected day's
  month, closes on select. `max` disables future days.
- **`components/range-picker.tsx`** ← `renderRangePicker` (2937–2979) +
  `pickRangeDate` (2921–2925). INLINE, not a popover — the old app renders it in
  the flow of the chart card. **Draft-then-commit is the behaviour that matters:**
  tapping days edits a draft, and nothing filters the chart until "Set Range". That
  is why the old app keeps `S.wpick` separate from `S.wfrom`/`S.wto`. Two-tap
  semantics and the backwards-pick swap (old `lo`/`hi`, 2944–2945) come free from
  react-day-picker's range mode.

**`lib/date.ts`** holds the calendar-day helpers. It works in LOCAL time while
`lib/engine` parses UTC — both conventions exist in the old app (`td()` at 484 is
local; `msFromIsoDate` is UTC). They never disagree because the `YYYY-MM-DD`
STRING is the interchange format and no `Date` object crosses the boundary. Keep
it that way.

Both render live on **`/styleguide`** so the dropdown rule can be verified with a
real thumb rather than argued about.

## 8. Data fetching — one client hook, manual refetch after write

Phase 3 is the first surface to read Supabase, so this sets the pattern for 4–8.

**Ruling: a `useWeights()` client hook exposing `{ weights, state, error, refetch }`,
with `state: 'loading' | 'error' | 'empty' | 'ready'`.** That union maps 1:1 onto the
§4.4 four-states rule, which is the reason to prefer it — the state machine and the
acceptance matrix are the same shape, so an unhandled state is a type error rather
than a missing screen. Writes call `refetch()` on `ok`.

Three explicit NOs, each with the trigger that would revisit it:

- **NOT Server Components / server actions.** They would fight the client-heavy
  reality of camera, canvas and charts for no gain at single-user scale, and
  `lib/data/` is browser-only by design (Plan §2/§8). Revisit only as a later
  optional optimisation.
- **NOT a fetching library** (TanStack Query, SWR) yet. Same "no machinery ahead of
  need" logic as the shadcn deferral. Trigger: multi-user, or the first real
  shared-server-state staleness bug — whichever fires first.
- **NOT optimistic updates.** Weight is logged once a day; a refetch round-trip is
  imperceptible and cannot drift from the DB. Reconsider for high-frequency MEAL
  logging in Phase 4, where §4.4 already anticipates a visible rollback.

*(Interview note: this was framed as a forward-decision pending a data layer. The
layer already exists — Phase 2 merged 2026-07-31 — so the ruling applies immediately.)*

### 8a. AMENDED 2026-08-04 at build time — the hook owns the writes too

The shipped API is `{ weights, state, error, refetch, log, remove }`. `log`/`remove`
wrap `logWeight`/`deleteWeight`, refetch on `ok`, and return the write's own `Result`
unchanged. The alternative — the page calling `lib/data` directly and remembering to
refetch — makes "write succeeded, list is stale" a one-line omission with nothing to
catch it. The ruling above was about rejecting a fetching library and an optimistic
layer; encapsulating an explicit refetch does neither.

Two contracts, pinned by `tests/hooks/useWeights.test.ts`:

- **A failed WRITE never moves the list into its error state.** `error`/`state`
  describe the LIST; a write that failed changed nothing, so the list keeps saying
  what it said. The caller surfaces the returned `Result` at the point of action —
  the button, the Undo toast (§6). A failed READ is the opposite: it sets `error`
  but KEEPS the last good rows, so the page can show a stale list under a visible
  error rather than blanking out.
- **Out-of-order responses are discarded** by sequence number. A slow initial read
  landing after a post-write refetch would otherwise quietly restore pre-write data
  with nothing looking wrong.

`weights` is ALWAYS the full history. The Week/Month/All filter narrows what is
DRAWN, never what reaches `trendWeight` / `weeklyRateAt` / `targetLine` (§2, §9).

**Test tooling:** `@testing-library/react` + `jsdom` added as devDependencies, and
`vitest.config.mts` gained the `@/*` alias mirroring `tsconfig.json`. The DOM
environment is opted into PER FILE (`// @vitest-environment jsdom`) so the pure
engine and data suites stay on `node`.

**Lint note:** the mount effect wraps `refetch()` in an awaited async IIFE. A bare
`void refetch()` trips `react-hooks/set-state-in-effect`, because the rule cannot see
that every `setState` in `refetch` happens after an await and so cannot cascade. The
wrapper is load-bearing — do not simplify it.

## 9. Engine additions required by this phase

`lib/engine/trend.ts` cannot currently express the filtered weight page. Three
additions, all pure and all tested against the old app:

1. **`weeklyRateAt(series, anchorDate)`** — the rate at a GIVEN date, computed from
   the full trend. Today's `weeklyRate(series)` always anchors to the series' last
   entry, so passing it the filtered slice would recompute the EMA from the slice and
   silently produce a wrong number (2993–3001 is the old app doing this correctly).
   `weeklyRate(s)` now delegates to `weeklyRateAt(s, last(s).date)`.
2. **`weeklyAverages(series)`** — Monday-based ISO week buckets (601–615).
3. **`targetLine(fullSeries, dates)`** — `first − (0.5/7) × daysSinceFirst`, rounded
   2dp, anchored to the FULL series' first entry per §2. `RATET = 0.5/7` (line 438)
   became `TARGET_RATE_KG_PER_DAY`, kept as a SEPARATE constant from
   `ASSUMED_RATE_KG_PER_WEEK` even though both mean 0.5 kg/wk — one draws a line, the
   other projects a date, and the old app kept them separate too.

Rounding here is display-facing but feeds a plotted series, so it lives in the
engine per the §6 boundary. Engine still returns numbers, never formatted strings —
`weeklyAverages` returns `avg` as a NUMBER where the old app returned `toFixed(1)`
strings, and `weekStart` as an ISO date rather than the old `"MM-DD"` label.

**ORACLE-PRESERVING FIX in `weeklyAverages`:** the old function mixes `getDay()` /
`setDate()` (LOCAL) with `toISOString()` (UTC) on a date parsed as UTC midnight. That
agrees at SAST and under a UTC test runner, but at a negative UTC offset every bucket
shifts by a day. Ours is UTC throughout — identical output everywhere the old app has
actually run, minus the trap. Owner confirmed 2026-08-04.

**Still open:** the dot colours of §2 need a fourth helper,
`weightDirections(fullSeries, dates)` returning `'first' | 'down' | 'up' | 'flat'`,
so that comparison also runs against the full series. To be added when the chart
lands; this list becomes four.

## 10. Empty state — the old app shows `0.0 kg`, we do not

With no weigh-ins, `lw()` returns `0` (488), so the old page renders Current
`0.0 kg` and To Goal `88.0 kg` — a fabricated reading. `eta()` has the same defect
(already logged as an ORACLE EXCEPTION in PHASE-1-DECISIONS).

**Ruling: the Empty state is a real invitation to act** (§4.4) — the Log Weight card
with a prompt, no tiles showing invented zeros, no chart. No stored row can produce
the old behaviour (the DB has never been empty), so no oracle value is violated.
This is why `useWeights` reports `empty` as a state distinct from `ready` with a
zero-length list (§8a).
