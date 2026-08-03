# CLAUDE.md — nutrisa-next

This file summarises the rules. **The Migration Master Plan is the authority.**
On any conflict, `docs/MIGRATION_PLAN.md` wins. On nutrition rules, food data, or
the arithmetic principle, the Project Instructions win.

## What this repo is
NutriSA migrated from a vanilla single-`index.html` app to **Next.js (App Router) +
TypeScript (strict) + Tailwind + shadcn/ui**, shipped as an **installable PWA**, on
Vercel. This is a TRANSLATION of a verified feature set — not a redesign, not new
features. Same Supabase project, ZERO schema changes.

## Hard rules — never break
- **The model never does arithmetic.** Code computes; the model only TRANSCRIBES
  (OCR reads label numbers) or EXPLAINS (coaching voice, later). Every displayed
  figure was computed in code. If a prompt change would make the model return a
  computed number, that change is FORBIDDEN. (Plan §6.)
- **Correctness oracle:** the OLD app's stored Supabase numbers are ground truth. A
  ported function is WRONG until it reproduces the old app's displayed value
  byte-for-byte on the same real rows. (Plan §6.)
- **No schema changes.** Tables are `weight_logs`, `meal_logs`, `custom_meals`,
  `water_logs`, `custom_foods` — FIVE, corrected Plan v1.3. Do not evolve them here.
  (Plan §2.)
- **No invented features.** The feature inventory (Plan §3) is closed. Nothing added
  without a dated note.
- **No RLS tightening / auth / multi-user here.** That is Phase 4 product work, a
  separate pass. Anon key is public by design; `service_role` key NEVER reaches the
  client; `ANTHROPIC_API_KEY` is server-only. (Plan §2, §8.)
- **Never build ahead of the current phase.** (Plan §10.)

## The dropdown rule (Project Instructions — THE most important)
On custom dropdown items use `onmousedown` + `event.preventDefault()`, NEVER
`onclick` (blur fires before click and kills the selection). Always click-outside-to-
close. Always Enter = select first / Escape = close. Or use shadcn primitives that
handle blur-before-click correctly.

## The four-states rule (Plan §4.4)
Every surface ships all four or it does not ship: Empty (an invitation to act),
Loading (skeleton in `--bg3`; camera/OCR get a live "transcribing…" indicator),
Error (says what happened + what to do, in interface voice, never a silent revert),
Happy. Track in `STATUS.md`.

## Design tokens (hex lives ONLY in `app/globals.css`)
`app/globals.css` is the one file of OURS containing a hex value, and each hex
appears exactly once — a Vitest test enforces both against an explicit file list
(not a repo-wide scan). `docs/reference/old-index.html` is full of hex and is
exempt: it is the old app, a read-only reference, never a style source. `@theme` holds `--color-*`
(Tailwind generates `bg-bg2`, `text-text-3`, `rounded-card` from it); the `:root`
block aliases the bare names `--bg` `--blue` `--protein` etc. as **`var()` references,
never re-typed hex** (Chart.js reads those in Phase 3). `/styleguide` renders the
palette by reading the live variables — it documents, it never restates.
Three unavoidable exceptions, all read before CSS exists: `app/layout.tsx`
(`viewport.themeColor`), `app/manifest.ts` (`theme_color`/`background_color`) and
`scripts/generate-icons.mjs`. Nothing enforces their agreement — if you change `--bg`
or `--blue`, grep the repo for the old hex and update all four sites by hand.

Surfaces: `--bg` `--bg2` `--bg3` `--border`. Semantic: `--blue` (primary/nav/
progress), `--green` (loss/goal/success), `--red` (gain/over-target/alert), `--amber`
(warning). Macro colours reserved for their macro ONLY: `--protein` `--carbs`
`--fats`. Dark-first always. Type: Barlow Condensed 800 italic (stats/titles) +
Barlow 400–600 (body), via `next/font`, `tabular-nums` on data. Touch targets ≥44px.
**Use the `font-display` utility for the display face** — it binds family + italic +
800 together. Setting only the family makes the browser faux-synthesise a wrong cut.

## Repo structure & stack facts (Phase 0)
- **Tailwind v4** — CSS-first. There is no `tailwind.config.js`; tokens live in
  `@theme` in `globals.css`.
- **shadcn/ui is NOT installed yet** (Phase 0 decision). Add it in the phase that
  first needs a primitive, and map its `--background`/`--primary` names onto the
  tokens above — the §4 names stay canonical.
- Routes: `app/(tabs)/` route group holds the shared bottom-nav layout; Dashboard is
  at `/` (no redirect on launch). `/styleguide` sits outside the group.
- Service worker is hand-written at `public/sw.js`, **production only**. It caches the
  shell and passes every non-GET, cross-origin and `/api/*` request straight through
  — that passthrough IS the "no offline write queue" guarantee (Plan §0.3). Never add
  a cache fallback to it.
- `npm run icons` regenerates the PWA icon set (currently a placeholder mark).

## The deterministic engine — `lib/engine/` (Plan §6, built Phase 1)
Pure, typed, dependency-free. Nothing here imports React or Supabase. Tests in
`tests/engine/`; the oracle fixture is `tests/fixtures/weight_logs.json`.
`kJtoKcal` (÷4.184), `perServingToPer100g` + inverse, `atwaterCheck` (4/4/9, 20%
of the LABEL's kcal), `clampLabelMacros`, `macrosForQuantity` (qty×perUnit,
`isGramUnit` picks the basis), `trendWeight`, `weeklyRate`, `eta`.
Phase 3 added `weeklyRateAt`, `weeklyAverages`, `targetLine`.
- **A filtered view must NEVER re-run the engine on the filtered slice.** Smoothing
  needs all past data, so the trend, the rate, the target line and the dot colours
  are all computed from the FULL series and only then sliced to the visible window.
  `weeklyRate(s)` anchors to the last entry of whatever it is handed — that is why
  `weeklyRateAt(fullSeries, anchorDate)` exists. Passing a slice is silently wrong
  arithmetic with no error anywhere. `docs/PHASE-3-DECISIONS.md` §2, §9.
- **Week bucketing is UTC-only** (`weeklyAverages`). The old app mixed `getDay()`
  (local) with `toISOString()` (UTC), which agrees with UTC arithmetic at SAST and in
  CI but breaks at negative offsets. Same numbers, no timezone trap. §9.
- **`trendWeight` rounds 2dp EVERY step and feeds the rounded value forward**:
  `tw[i]=round(0.1*w[i]+0.9*tw[i-1], 2)`, seed `tw[0]=w[0]` unrounded, via
  `+n.toFixed(2)` (never `Math.round`). This matches the old app, NOT the clean
  formula. Frozen — do not "clean up". `docs/PHASE-1-DECISIONS.md` §1.
- Engine returns **numbers, never formatted strings**. Rounding that gets
  persisted or feeds more arithmetic is engine; rounding that only renders is
  display. `eta` returns `no-data`/`reached`/`projected`+`Date`.
- `weeklyRate`/`eta` use calendar dates not indices, and the TREND not raw.
  `eta` projects at an assumed 0.5 kg/wk and counts from today — both are
  carried-forward old-app quirks, deliberate.
- `unitType` is an OPEN string, not a closed union — users type their own unit
  names. Only `g`/`ml` are special (per-100 basis); everything else is per-unit.

## How we work
- Plan in Claude.ai first; build in Claude Code. One phase = one branch = one fresh
  session. Interview-before-code at the start of each phase; do not auto-accept.
- Gates: `/office-hours` to plan · `/review` before every commit · manual git only ·
  **never `/ship`**.
- Every change ships with: (a) the change, (b) exact test/verify steps, (c) exact git
  commands. The owner should never have to ask for the git commands.
- Verification is the OWNER's job on the real phone. Claude Code cannot reach Live
  Server or the device.
- Shell is **PowerShell 5.1 — no `&&`.** One command per line.

## The data layer — `lib/data/` (Plan §2/§8, built Phase 2)
Browser-only Supabase client, one shared instance. Reads the FIVE existing tables.
`client.ts` · `types.ts` · `mappers.ts` · one module per table · `index.ts` barrel.
Tests in `tests/data/`. Rulings in `docs/PHASE-2-DECISIONS.md`.
- **Every write returns a typed `Result`, never throws.** `{ok:true,data}` /
  `{ok:false,error:{kind,message}}`. No silent failure anywhere (§4.4).
- **Mappers round on READ** — `Math.round(kcal)`, `+parseFloat(x).toFixed(1)` on
  `pro`/`carb`/`fat`. The DB may hold more precision than the old app ever showed.
  That rounding feeds day totals, so it is engine-side, not display. Frozen.
- **Column names ≠ field names.** `per_unit`→`perUnit`, `default_qty`→`defaultQty`,
  `unit_label`→`unitLabel`, `logged_time`→`time`, `ings_json` (JSON string) →`_ings`
  (parsed), `id`→`_id`. A wrong mapping is silently wrong macros. Test the mappers.
- **No localStorage, no merge, no offline queue** (§0.3). Cloud rows only.
- `sort_order` is a REQUIRED caller parameter (the day's list length), never derived.

## Current phase
Phase 3 — Weight tab. See `plan.md` and `docs/PHASE-3-DECISIONS.md`.
Phases 0 (scaffold, tokens, PWA shell, tab nav), 1 (deterministic engine) and 2
(Supabase data layer) are merged. Phase 3 is the FIRST phase that ships a surface,
so several of its rulings set precedent for Phases 4–8:
- **Chart.js via npm** (not the old CDN tag). Colours read from the live CSS vars via
  `getComputedStyle` — no hex in any `.ts`/`.tsx`.
- **shadcn/ui installs here** (`calendar`, `popover`) — this is the phase that first
  needs a primitive. Its names map onto our tokens as `var()` refs; §4 names stay
  canonical. The dropdown rule still governs anything we hand-render inside a Popover.
- **Data fetching: one client hook, manual refetch after write.** `useWeights()`
  exposes `state: 'loading' | 'error' | 'empty' | 'ready'` — that union IS the
  four-states rule, so an unhandled state is a type error. No Server Components (the
  data layer is browser-only by design), no fetching library, no optimistic updates
  yet; each NO has a recorded revisit trigger. `docs/PHASE-3-DECISIONS.md` §8.
- **The chart gains a trend line the old app never had** (Plan §5.3 over the old
  screen) and **finishes the half-applied zoom fix**: target line and dot colours
  anchor to the FULL series, not the visible slice. This changes rendered PIXELS but
  no NUMBER — the tiles, history and trend all still match the old app. §1, §2.
