# NUTRISA — MIGRATION MASTER PLAN
## index.html → Next.js PWA · Translation Spec & Design System · v1.1 · 2026-07-31

> **What this document is.** The single source of truth for migrating NutriSA from a
> vanilla single-`index.html` app to Next.js (App Router) + TypeScript + Tailwind +
> shadcn/ui, shipped as an **installable PWA**, on Vercel. Claude Code reads this
> fresh every session. It survives context loss. It is a TRANSLATION SPEC of a
> verified feature set — **not** a redesign brief. MasterContext + Project
> Instructions describe what exists; this document describes what it becomes. Where
> they conflict on layout/stack, this document wins. Where they conflict on
> nutrition rules, food data, or the deterministic-engine principle, THEY win —
> those are product law, not migration detail.
>
> **What Claude Code may never do under this plan:** invent features, let the model
> do arithmetic (§6 — read twice), change a stored number's value, evolve the
> Supabase schema, restyle beyond the design system (§4), or build ahead of the
> current phase.

### Changelog

| Version | Date | Author | Change |
|---|---|---|---|
| v1.0 | 2026-07-31 | Owner + Claude | Initial plan |
| v1.2 | 2026-07-31 | Owner + Claude Code | Phase 1 amendment, no scope change: §6's `trendWeight` formula corrected to the OLD APP's actual algorithm (2 dp rounded every step, fed forward) — the v1.1 line stated a clean formula the app has never run. Ruled by the correctness oracle. Full reasoning and all Phase 1 rulings in `docs/PHASE-1-DECISIONS.md` |
| v1.1 | 2026-07-31 | Owner + Claude | Defect fixes only, no scope change: (1) all dead "§12" cross-references corrected to §11 (deferred log); (2) §5 "Five surfaces" corrected to four; (3) Coach-migration-first precondition made explicit in §0.1 (was silently assumed by §2's "reuse the muscle memory" rationale); (4) `CLAUDE.md` / `plan.md` / `STATUS.md` contents now specified in §9.2, seeded in Phase 0, and §4.4's matrix reference repointed accordingly |

---

## 0. THREE STANDING RULINGS — TWO OVERRIDABLE, ONE NOT

**0.1 — WHEN this runs (NOT overridable — it is the SOP's core rule).**
This migration is written NOW and executed LATER. The SOP is explicit twice over:
*migrate a frozen spec, never a moving target.* NutriSA is not frozen — Phase 2's
adaptive TDEE engine and coaching-voice layer are unbuilt, and Phase 3.5 voice
food-logging is deferred to *after* React. Executing this migration mid-Phase-2
would be redesigning a moving target: the exact failure the SOP warns costs days.

**The trigger to START Phase 0 of this plan is EITHER:** (a) the deterministic TDEE
engine is built and stable, OR (b) `index.html` "starts hurting" — the file becomes
genuinely painful to work in. Whichever fires first. Until then, this document is a
ready-to-run spec and a forcing function for freezing the feature inventory. It is
not a licence to start scaffolding this week.

**Precondition (added v1.1 — makes explicit what §2 silently assumed):** the Cold
Call Coach → Next.js migration must be **complete and cut over** before this plan's
Phase 0 starts, per the 2026-07-29 sequencing decision (Coach migrates first, after
its 80% consolidation pass). The §2 framework rationale — "same skeleton as Cold
Call Coach, reuse the muscle memory" — is only true if the Coach migration has
already happened. If a §0.1 trigger fires while the Coach migration is unfinished,
the correct order is: finish the Coach migration first, then run this plan. Do not
learn Next.js for the first time on NutriSA — it is the harder of the two apps
(camera flows, charts, the deterministic engine).

**0.2 — Weekly Check-In report: CUT (overridable).** Struck 2026-07-31 at the
owner's instruction. Not translated. It is a manager's summary surface; the SOP's
cut-discipline says a dead surface is pure translation cost. Logged in §11 as a
deferred re-add. Data untouched — nothing that fed the report is deleted, only the
tab is not rebuilt.

**0.3 — Offline logging: CUT (overridable).** The current app's localStorage offline
fallback is NOT translated as a real feature. Cloud (Supabase) is the sole source of
truth; the owner is online enough. The PWA service worker caches the app SHELL only
(§4.5) — it does not queue offline writes. This is a real simplification: it removes
the hardest part of PWA work (offline write queue + conflict resolution). Logged in
§11; re-add trigger = multi-user, or repeated gym-signal loss during logging.

---

## 1. DESIGN PHILOSOPHY — RULES FOR EVERY SCREEN

The owner's rules, in the owner's voice. Obeyed on every screen, component, and
empty state. These descend directly from Role 5 (UI/UX Designer) in the Project
Instructions — this section does not invent taste, it inherits it.

1. **Data is the product.** Weight, macros, trend, targets — the numbers ARE the
   interface. Nothing decorative competes with them for attention.
2. **Fewer taps to log.** The current app "feels cramped" and logging takes too many
   taps — that is the stated problem this rebuild exists to solve. Model the
   frictionless feel of MacroFactor / MyFitnessPal. Every screen: what am I looking
   at, how am I tracking, what do I log next — parseable in under ten seconds.
3. **Dark-first, always.** Deep neutral background, high-contrast type, strategic
   accent. This is NutriSA's identity, not a theme choice (§4). The Cold Call Coach
   went light; NutriSA stays dark. Do not "modernise" it to a light theme.
4. **Mobile-first, genuinely.** Not "responsive as an afterthought." The primary
   device is a phone held one-handed at a gym or a kitchen counter. Touch targets
   ≥44×44px, thumb-reachable primary actions, no hover-dependent controls.
5. **Colour is semantic.** Blue = primary/navigation/progress. Green = loss/goal/
   success. Red = gain/over-target/alert. Amber = warning/check-intake. The three
   macro colours (protein/carbs/fat) are reserved for those macros and nothing else.
   No colour is decoration.
6. **Trust the trend, not the point.** Single-day weight spikes are water/glycogen
   noise. The trend-weight line is the truth the UI defends (§6). Never let a raw
   daily number masquerade as progress.
7. **The model never does arithmetic.** Non-negotiable. See §6. This is the spine of
   the entire app and the single largest migration risk.

---

## 2. BUILD TARGET & STACK

| Concern | Decision | Why (the one-line reason that survives the session) |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript, strict | Same skeleton as Cold Call Coach — reuse the muscle memory, not re-learn a framework. **Precondition: the Coach migration ships first (§0.1)** |
| Delivery | **Installable PWA** (manifest + service worker, shell-cache only) | Owner wants "genuine app feel now, app-store decision later." PWA keeps that door open for free; Expo would force native overhead onto a one-user tool today |
| Styling | Tailwind + shadcn/ui primitives, themed by §4 tokens | shadcn consumes CSS variables — the existing NutriSA tokens ARE the theme |
| Native path (LATER) | Capacitor-wrap the PWA, or rebuild screens in Expo reusing logic | Deferred (§11). Not now. The PWA is the correct Phase-3 shape |
| Repo | **New GitHub repo** (e.g. `nutrisa-next`), new Vercel project | `create-next-app` owns root and collides with existing `index.html`; side-by-side cutover needs two real deployments |
| Hosting | Vercel, new project, env vars re-added once | Same as Coach migration |
| API | Next.js Route Handlers translating existing serverless functions 1:1 (§8) | Only module syntax changes; semantics identical |
| Data | **SAME Supabase project. ZERO schema changes.** Tables: `weight_logs`, `meal_logs`, `custom_meals`, `water_logs` | Locked 2026-07-31. Both apps read the same DB live during cutover. Old app's stored numbers are the correctness oracle (§0.1, §6) |
| Auth | None this migration — still single-user, permissive RLS, anon key public by design | Multi-user/RLS/auth is Phase 4 of the product, not this migration. Do NOT tighten RLS here — it is a separate planning pass |
| Secrets | `ANTHROPIC_API_KEY` server-only (OCR + future coaching). Supabase **anon** key is public by design and may sit in client config; **service_role** key NEVER reaches the client | The anon key being public is fine ONLY because RLS tightening is a known Phase-4 item. Do not add service_role to the frontend under any framing |
| Old app | Stays live and untouched (`nutri-sa-three.vercel.app` + GitHub Pages backup) until §10 Phase 9 cutover passes | Both front doors keep working through cutover |

---

## 3. FEATURE INVENTORY — KEEP / REFINE / CUT

Adjudicated 2026-07-31 against the current `feat/ocr-label` branch (clean tree,
last commit `e7169e9`). This table is closed. Nothing may be added without a note
recording who added it and when — same discipline as the Coach plan's amended table.

### KEEP (translate as-is, behaviour identical)

| Feature | Notes |
|---|---|
| **Dashboard**: goal banner, progress ring, stat tiles, weight chart (with date picker), macro bars | The reading surface. Layout refined per §5; data identical |
| **Weight tracker**: raw daily chart + trend line + target projection + 88kg goal line, Week/Month/All filter, history list, date picker | Trend algorithm (§6) is frozen. Chart-zoom fix (dot colours + projection computed from FULL history, not visible slice) MUST carry forward — it was a real bug |
| **Nutrition tab**: date picker, macro tiles, logged meals, water tracker, copy-yesterday's-meals | The daily driver. Refine for fewer taps (§5), data identical |
| **Three-tier add-food flow**: barcode scan → OCR photo → manual entry, all funnelling to one custom-food shape | The crown jewel and the hardest translation. See §7 — it gets its own spec |
| **Barcode scan**: native `BarcodeDetector` + `@zxing/browser` fallback + Open Food Facts pre-fill + serving-size detection (per-serving default, qty rescale, per-100g canonical storage, ml-aware labels) | Web camera APIs work identically inside a PWA. Ported to a typed `useBarcode` hook. CDN hardening (SRI + CSP) carries forward |
| **OCR label photo**: client downscale ≤1500px JPEG → `/api/ocr-label` → vision transcribe → deterministic kJ→kcal + per-serving→per-100g + Atwater check → pre-fill manual boxes. NEVER auto-saves; falls back to blank manual on any failure | The newest feature and the sharpest arithmetic-trap case (§6). The model transcribes; CODE converts. Ported behaviour-identical |
| **Library / Meal Builder**: search (names + ingredients), collapsible cards, tabbed view, expandable gram editor with live macro calc, food database (55+ SA items), save-to-library | The `unitType` system (`g`/`slice`/`piece`/`tbsp`/`tsp`/`cup`/`ml`) is preserved exactly — macros = quantity × perUnit, unit label always shown |
| **Water tracker** | Simple counter → `water_logs`. Behaviour-identical |
| **Mobile input hardening**: comma/decimal accepted on weight + macro fields, debounced gram input (300ms), weight-page calendar no longer clips | These were hard-won bug fixes. Carry EVERY one forward — they are the difference between "works on my phone" and not |

### REFINE (layout/presentation only — data model and numbers untouched)

| Feature | Refinement |
|---|---|
| Dashboard density | Currently "feels cramped." Reduce density, bigger trend number, clearer hierarchy. §5. Data identical |
| Add-food entry point | Collapse the three tiers into one obvious "Add food" action that offers scan / photo / manual without three separate buried buttons. Fewer taps (§5) |
| Logged-meals list | MacroFactor-style quick-log affordance; drag-drop from library preserved but not the ONLY path |
| Macro tiles | Protein/carbs/fat colours reserved (§1.5); tiles show remaining-to-target, not just consumed |

### CUT (do not translate; log in §11)

| Feature | Reason |
|---|---|
| **Weekly Check-In report tab** | Struck 2026-07-31 by owner (§0.2). Manager's summary surface; disproportionate translation cost for a solo tool. Data that fed it is untouched — only the tab is not rebuilt |
| **Offline logging (localStorage write fallback)** | Struck 2026-07-31 by owner (§0.3). Cloud is source of truth. Service worker caches shell only |

### NEVER BUILD (ruled out for this migration — belong to later product phases)

- Multi-user, auth, login, RLS tightening, POPIA consent flows — Phase 4 of the
  product, a separate planning pass, NOT this migration.
- The adaptive TDEE engine and AI coaching-voice layer — these are Phase 2 PRODUCT
  work that should land in `index.html` (or its successor) and STABILISE before this
  migration runs at all (§0.1). Do not build them for the first time inside this
  migration.
- PayFast / subscriptions / pricing tiers — Phase 4.

---

## 4. DESIGN SYSTEM — DARK DATA-FORWARD

The target mood: **a precise, dark, data-forward fitness instrument** — MacroFactor's
clarity, Apple Health's calm, Linear's discipline. The anti-reference is any
consumer-fitness app that buries the numbers under gradients, hero photography, and
motivational stock imagery. If a screen starts to feel like a lifestyle brand instead
of an instrument, stop and strip.

This is a **deliberate identity CONTINUATION**, not a break: the tokens below are the
owner's existing NutriSA tokens, promoted to the migration's frozen palette. (Contrast
with the Coach plan, which deliberately broke to light — NutriSA keeps its skin.)

### 4.1 Palette
Define as CSS variables / Tailwind theme tokens; shadcn components consume these,
never raw hex in components.

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#0D0F14` | Page background |
| `--bg2` | `#13161E` | Card / panel / modal background |
| `--bg3` | `#1A1E29` | Secondary elements, insets, table header rows |
| `--border` | derive (~`#242A38`) | 1px borders — pick once, use everywhere |
| `--blue` | `#0066FF` | Primary, navigation, progress, links, focus rings |
| `--green` | `#22C55E` | Loss / goal achieved / success / on-track |
| `--red` | `#FF3B30` | Gain / over-target / alert / destructive |
| `--amber` | `#F59E0B` | Warning / check-intake / caution |
| `--protein` | `#A78BFA` | Protein macro ONLY |
| `--carbs` | `#FCD34D` | Carbs macro ONLY |
| `--fats` | `#2DD4BF` | Fat macro ONLY |

Text colours: derive a 3-step ramp on the dark bg (primary near-white, secondary
muted, tertiary/label slate). Pick the three hexes once in the styleguide and reuse.

Macro colours are load-bearing, not decorative: the protein bar is `--protein`
everywhere it appears — dashboard, tile, library live-calc — single source, no
per-screen improvisation.

### 4.2 Typography
Keep the owner's pairing — it is already a real choice, not a default:
- **Barlow Condensed 800 italic** — stats, big numbers, page titles, the trend
  weight. The characterful display face, used with restraint.
- **Barlow 400–600** — body, labels, controls, evidence text.

Both via `next/font` (self-hosted). Numbers in data contexts get
`font-variant-numeric: tabular-nums` so columns of weights, macros, and dates align.

App-scale ramp (in-app the largest element is a stat, not a marketing hero):

| Role | Spec |
|---|---|
| Hero stat (trend weight, primary dashboard number) | Barlow Condensed 800 italic, ~44px, tabular-nums |
| Page title | Barlow Condensed 800 italic, ~24px |
| Section header | Barlow 600, ~18px |
| Card header | Barlow 600, ~15px |
| Body / value text | Barlow 400, ~15px, 1.6 line-height |
| Label / meta / eyebrow | Barlow 500, ~12px, +0.04em, uppercase, tertiary text colour |

### 4.3 Geometry & elevation
- Spacing scale: **4 / 8 / 16 / 24 / 32** — pick a scale, no eyeballed values.
- Border-radius: cards/modals/inputs one value (~10–12px, softer than the Coach's
  terminal feel — this is a consumer instrument), buttons/chips one smaller value.
  Never pill-rounded, never 0px-sharp.
- Elevation on a dark theme comes from **surface lift** (`--bg2` on `--bg`, `--bg3`
  inset), not heavy shadows. One subtle shadow max on floating surfaces (modals,
  sheets, drag ghosts). Resting cards use surface + border only.
- Charts: Chart.js carries forward (it is a KEEP), themed to tokens — no default
  Chart.js palette. Trend line, target line, goal line each have a defined colour.
- Every interactive element: visible hover/press state + visible focus ring
  (`--blue`). Keyboard focus always visible. Touch target ≥44px.

### 4.4 The four states — acceptance rule (from the SOP, non-negotiable)
Every surface ships all four states or it does not ship:
- **Empty** — an invitation to act, in interface voice (`No meals logged yet. Scan a
  barcode or add a food to start.`). Never a blank void.
- **Loading** — skeleton in `--bg3`, no spinners-as-personality. (Camera/OCR are the
  exception: a live "transcribing label…" indicator is correct there — a 3–8s silent
  wait reads as broken.)
- **Error** — states what happened and what to do, in the interface's voice. Never
  apologises, never vague. OCR failure = fall back to blank manual entry WITH a line
  saying the photo couldn't be read (never a silent revert). Failed optimistic writes
  roll back visibly + toast.
- **Happy** — the spec'd layout.

Maintain the four-states matrix in `STATUS.md` (defined in §9.2) — it is the
acceptance checklist per phase, same as the Coach plan.

### 4.5 PWA specifics
- **Manifest**: name, icons (maskable set), `display: standalone`, `theme_color`
  `#0D0F14`, `background_color` `#0D0F14` — the splash matches the dark bg so launch
  feels native, not a white flash.
- **Service worker**: caches the app SHELL only (HTML, JS, CSS, fonts, icons).
  **Does NOT queue offline writes** (§0.3). A cache-first shell + network-first data
  strategy. When offline, the shell loads and data calls show the error state — they
  do not silently succeed against a local queue.
- **Install prompt**: a quiet, dismissible "Add to Home Screen" affordance, not a
  nag. iOS gets the manual-install hint (iOS has no `beforeinstallprompt`).
- Safe-area insets respected (notch / home indicator). Full-screen means the app
  owns the whole viewport including the unsafe edges.

---

## 5. SCREEN SPECS (the REFINE detail)

Four surfaces (Weekly Check-In cut — §0.2). Bottom tab bar, thumb-reachable:
**Dashboard · Nutrition · Weight · Library**. (Four tabs — clean, mobile-native.)

### 5.1 Dashboard — "how am I tracking?"
Top to bottom, answering three questions:
- **Trend weight hero** — the trend number (Barlow Condensed 800 italic, ~44px),
  direction vs last week, distance to 88kg goal. This is the truth the app defends
  (§6). NOT the raw daily weight.
- **Today's macros** — four bars (calories + protein/carbs/fat in their reserved
  colours), each showing remaining-to-target, not just consumed. Tap → Nutrition.
- **Weight chart** — raw daily + trend line + target projection + goal line, with the
  date picker. Y-axis matches the Weight page scale (carried-forward fix).
Progress ring and goal banner from the old dashboard are KEPT but subordinate — they
do not out-shout the trend number.

### 5.2 Nutrition — "log my food, fast"
The screen the rebuild exists to improve. One obvious **Add food** primary action
(thumb-reachable) that opens scan / photo / manual (§7). Macro tiles at top
(remaining-to-target). Logged meals below, grouped by the day's meal structure.
Water tracker inline. Copy-yesterday's-meals as a one-tap affordance. Date picker to
move between days. Fewer taps than the old drag-drop-only flow — drag-drop from
library is PRESERVED but is no longer the only path.

### 5.3 Weight — "trend, not noise"
Raw daily chart + trend line + target projection + 88kg goal line. Week/Month/All
filter. History list below (each entry editable). Date picker for back-dating.
The chart-zoom fix carries forward: dot colours and the projection line are computed
from the **full** history, never the visible slice.

### 5.4 Library / Meal Builder — "my food, my meals"
Tabbed: saved foods / meal builder. Search across names + ingredients
(`onmousedown` + `preventDefault` on dropdown items, click-outside-to-close, Enter/
Escape — the critical dropdown rules from Project Instructions). Collapsible cards.
Expandable gram editor with live macro calc respecting `unitType`. Save composed
meals to the library.

---

## 6. DETERMINISTIC ENGINE CONTRACT — READ TWICE

**The model never does arithmetic. JavaScript computes; the model only TRANSCRIBES
(OCR reads label numbers) and, later, EXPLAINS (coaching voice describes numbers it
did not compute). Any figure displayed anywhere was computed in code.**

This is the SOP's loudest warning and it is sharper in NutriSA than anywhere the SOP
discussed, because NutriSA is *made of arithmetic*. The trip-planner in the tutorial
let the model total a budget and it was "fine." Here, a calorie the model invented is
a correctness disaster dressed as a feature.

Port every one of these as a pure, typed, dependency-free function with its FIRST-EVER
unit tests (Vitest):

| Function | Contract |
|---|---|
| `kJtoKcal(kJ)` | ÷ 4.184. Never let the model return kcal directly from a label — it reads the kJ printed, code converts |
| `perServingToPer100g(value, servingG)` | Canonical storage is per-100g. Code rescales. Model reports the printed per-serving value + serving size only |
| `atwaterCheck(kcal, p, c, f)` | 4/4/9 reconstruction within tolerance → flags an implausible OCR read. Code decides plausibility, not the model |
| `trendWeight(series)` | Exponential smoothing **α=0.1**, rounded 2 dp EVERY step with the rounded value fed forward: `tw[i] = round(0.1*w[i] + 0.9*tw[i-1], 2)`, seeded `tw[0] = w[0]` **unrounded**. Frozen. **Amended v1.2** — v1.1 stated the clean unrounded formula, which the old app has never run; the per-step rounding drifts from it by −0.0061 kg over the 36-row fixture. A fidelity choice, mildly worse numerically, kept to match the oracle. Do not "clean up" without deliberate re-verification (`docs/PHASE-1-DECISIONS.md` §1) |
| `macrosForQuantity(food, qty)` | `qty × perUnit`, respecting `unitType`. No model involvement, ever |
| `weeklyRate` / `eta` | Weekly rate from CALENDAR dates (not array indices — carried-forward fix); ETA from TREND weight (not raw — carried-forward fix) |

**The correctness oracle (this migration's defining verification gate).** Because the
new app reads the OLD Supabase data unchanged (§0.1), the old app's stored numbers are
ground truth. Every function above is WRONG until it reproduces the old app's displayed
value **byte-for-byte** on the same real rows. Unit tests use real fixtures pulled from
the live DB: a known label photo's transcription → expected per-100g macros; the real
weight series → expected trend line; a known custom food × quantity → expected macros.

**OCR specifically.** `/api/ocr-label` returns the label's PRINTED values + units +
serving size, as a JSON schema (forced tool-use, same pattern as the Coach scorer).
It returns NO computed per-100g figure and NO kcal-from-kJ. The client runs
`kJtoKcal`, `perServingToPer100g`, `atwaterCheck` and pre-fills the manual boxes.
Never auto-saves. Any failure → blank manual entry + a visible "couldn't read that
label" line. If a prompt change would make the model return a computed number, that
change is FORBIDDEN.

---

## 7. THE ADD-FOOD FLOW — CROWN-JEWEL SPEC

The hardest translation in the plan. Three tiers, one destination shape.

**One entry, three tiers, one shape.** A single **Add food** action offers:
1. **Barcode scan** → native `BarcodeDetector`, `@zxing/browser` fallback, graceful
   exit to manual on unsupported/denied camera. On hit → Open Food Facts lookup →
   pre-fill. Serving-size detection: per-serving default view, quantity rescale,
   log-by-unit, ml-aware labels, per-100g canonical storage.
2. **OCR photo** (when barcode misses / not in OFF) → capture → client downscale
   ≤1500px JPEG → `/api/ocr-label` → transcribe → deterministic convert (§6) →
   pre-fill the SAME manual boxes. Never auto-saves.
3. **Manual entry** → the blank form all tiers pre-fill. The floor every fallback
   lands on.

**All three funnel to one custom-food shape** (`sc_cf` / `S.customFoods` in the old
app → typed `CustomFood` in the new one, same fields). Barcode and OCR are just
pre-fillers of the manual form — they never write a different record type. This is
what keeps the flow maintainable and is preserved exactly.

**Ported as typed hooks**, not inline handlers: `useBarcodeScanner`, `useLabelOcr`,
sharing a `useCameraStream` primitive. Four states each (camera denied = error state
with the manual-entry escape always one tap away). CDN hardening (SRI + CSP) for ZXing
carries forward.

**Camera in a PWA:** `getUserMedia`, `BarcodeDetector`, and the file/photo capture
path are standard web APIs and work identically inside an installed PWA. This is the
whole reason PWA beats native-now for this app — the camera flows survive the move as
a translation, not a rewrite.

---

## 8. API TRANSLATION CONTRACT

Each existing serverless function becomes a Next.js Route Handler. **Semantics
behaviour-identical; only module syntax changes.**

| Route | Methods | Preserved semantics |
|---|---|---|
| `/api/ocr-label` | POST | Receives downscaled JPEG. Vision model (Claude Haiku 4.5, `claude-haiku-4-5-20251001`) forced-tool-use JSON: printed values + units + serving size ONLY. No computed numbers. Per-IP best-effort rate limiter; Anthropic spend cap is the real financial backstop |
| (future) `/api/coach` | POST | NOT built in this migration. When it lands (post-migration, Phase 2 product work), it EXPLAINS numbers the engine computed — it never calculates |

Data reads/writes go to Supabase directly via the typed client against the SAME tables
(`weight_logs`, `meal_logs`, `custom_meals`, `water_logs`) — no new CRUD routes needed
where the old app used the Supabase JS client directly; preserve that pattern.

**Universal handler rules:** `ANTHROPIC_API_KEY` server-only; zero frontend lines
carry it. Supabase anon key public by design (RLS tightening is Phase 4, not here).
service_role key NEVER in the client. No stack traces in error bodies. Downscale
happens client-side before upload (bandwidth + cost).

---

## 9. HOW THE OWNER WORKS — BAKE INTO EVERY SESSION (from the SOP)

- **Plan in Claude.ai first; build in Claude Code.** One phase per branch, fresh
  Claude Code session per phase (avoids context compaction degrading output). Plan
  approved here before a line is written.
- **SOP Stage 0 — interview before code.** Run the plan-mode interview prompt at the
  start of each phase: it interviews you on the gaps (what the user sees mid-OCR,
  failure behaviour when the camera denies, how the trend line renders with <2 weeks
  of data) before implementing. Do not auto-accept the plan — read it whole.
- **Repo-level memory (SOP Stage 2):** `CLAUDE.md`, `plan.md`, and `STATUS.md` live
  IN THE REPO, not just here. They survive compaction. Contents specified in §9.2;
  seeded in Phase 0.
- **Gates:** `/office-hours` to plan · `/review` before every commit · manual git
  only · never `/ship`.
- **Code-delivery standard, every change:** (a) the change, (b) exact test/verify
  steps, (c) exact git commands. The owner should never have to ask for the git
  commands.
- **Verification is the OWNER's job.** Claude Code cannot reach Live Server or the
  phone. Every phase states exactly what to verify on the real device. Test on Live
  Server, then on the actual phone, before pushing.
- **Dropdown rule (Project Instructions, THE most important):** `onmousedown` +
  `event.preventDefault()` on dropdown items, never `onclick`; click-outside-to-close;
  Enter/Escape support — or shadcn primitives that handle blur-before-click correctly.
- **SOP adoptions that are NEW gaps for NutriSA:**
  - **Sentry** before `/api/ocr-label` is trusted in the new app — a public paid AI
    endpoint needs to tell you within minutes if it errors or the spend spikes.
  - **Delete-account + data-export as REAL features** — POPIA erasure/access are
    features you build, not clauses you write. Banked into Phase 4 product work, but
    noted here so the schema-untouched migration doesn't make them harder later.
  - **`shots.so`** to frame the Post #3 (OCR build) LinkedIn still — only where a
    still is the right call, never to polish away the "unedited = real" authenticity.

### 9.1 The git loop — exact commands (NutriSA repo)

*Repo facts:* new repo `nutrisa-next` (create at Phase 0), remote `origin`, `main`
tracks `origin/main`. Shell is **PowerShell 5.1 — no `&&`.** One command per line;
paste the block, PowerShell runs them in order.

**① Start a phase**
```
git checkout main
git pull --ff-only
git checkout -b phase-N-shortname
```

**② Commit** — after gates pass and after `/review`, never before.
```
npm test
npx tsc --noEmit
npm run lint
npm run build
git add .
git commit -m "Phase N: what it does"
git push -u origin phase-N-shortname
```
`-u` only on the first push of a branch; plain `git push` after.

**③ Land on main** — fast-forward default.
```
git checkout main
git pull --ff-only
git merge --ff-only phase-N-shortname
git push
git branch -d phase-N-shortname
git push origin --delete phase-N-shortname
```
If `git merge --ff-only` refuses, `main` moved — rebase and retry:
```
git checkout phase-N-shortname
git fetch origin
git rebase origin/main
git push --force-with-lease
git checkout main
git merge --ff-only phase-N-shortname
git push
```
`--force-with-lease`, never plain `--force`.

**④ Start of any session** — get level first:
```
git checkout main
git pull --ff-only
git status
```

### 9.2 Repo-memory files — contents (added v1.1; §9 mandated them, nothing defined them)

Seeded in Phase 0, kept current every phase. These are the anti-improvisation layer:
if they exist and are accurate, a fresh Claude Code session cannot drift.

**`CLAUDE.md`** — under ~60 lines, conventions only, no narrative:
- Stack + repo facts (Next.js App Router, TS strict, Tailwind + shadcn, PWA
  shell-only SW, same Supabase project, PowerShell 5.1 — no `&&`).
- The §6 arithmetic rule, stated verbatim: *the model never does arithmetic; code
  computes, the model transcribes or explains.*
- The dropdown rule (`onmousedown` + `preventDefault`, click-outside, Enter/Escape —
  or shadcn primitives).
- The four-states acceptance rule (§4.4) and the correctness-oracle rule (§6): a
  ported function is wrong until it matches the old app byte-for-byte on real rows.
- Token names only (no hex — the styleguide route is the source): `--bg/--bg2/--bg3`,
  semantic four, three macro colours reserved.
- Gates: `/office-hours` · `/review` · manual git · never `/ship`.
- One line: *"This file summarises; the Migration Master Plan is the authority.
  On conflict, the Plan wins."*

**`plan.md`** — §10's nine phases as a live checklist, one line per phase:
`[ ] / [x]` · phase name · branch name · merge date. Ticked ONLY on merge to main,
never on "mostly done". Nothing else goes in this file.

**`STATUS.md`** — the four-states matrix (§4.4). Rows = every surface: Dashboard,
Nutrition, Weight, Library/Meal Builder, and each add-food tier (barcode / OCR /
manual). Columns = Empty · Loading · Error · Happy. A cell is ticked only after
verification on the actual phone, not on Live Server alone. This matrix IS the
Phase 9 acceptance checklist — cutover cannot start with an unticked cell.

---

## 10. PHASED BUILD CHECKLIST

One phase = one branch = one fresh session = independently verifiable. Old app
(`nutri-sa-three.vercel.app`) stays live throughout. Do not start a phase until the
previous one is merged. **Do not start Phase 0 at all until the §0.1 trigger fires
AND the Coach migration precondition (§0.1) is met.**

- [ ] **Phase 0 — New repo, scaffold, tokens, PWA shell.** New GitHub repo + Vercel
      project (old repo untouched). Same Supabase project, env vars re-added.
      `create-next-app` (TS strict) + Tailwind + shadcn/ui. Encode §4 fully: dark
      tokens, Barlow + Barlow Condensed via `next/font`, type ramp, radius, surface
      lift. PWA manifest + shell-only service worker (§4.5). `/styleguide` route
      rendering every token, type role, macro colour, badge, button state. Bottom tab
      shell (Dashboard · Nutrition · Weight · Library). Seed `CLAUDE.md`, `plan.md`,
      `STATUS.md` per §9.2. **Verify:** styleguide matches §4 on laptop + installed
      on phone home screen; dark splash, no white flash; safe-area insets correct;
      all three repo-memory files present and accurate.
- [ ] **Phase 1 — Deterministic engine + first tests.** Every §6 function as pure
      typed functions + Vitest suite. **Verify:** tests green; each function
      reproduces the OLD app's stored values byte-for-byte on real DB rows (the
      correctness oracle). Trend line for the real weight series matches exactly.
- [ ] **Phase 2 — Supabase data layer.** Typed client against the four existing
      tables, read + write, no schema changes. **Verify:** new app reads existing
      weight/meal/custom-food/water rows and displays identical numbers to the old
      app, side by side, same DB.
- [ ] **Phase 3 — Weight tab.** Chart (raw + trend + target + goal), filter, history,
      date picker, back-dated edits. **Verify (phone):** log a weight; it appears in
      both apps; trend recomputes; chart-zoom fix holds (full-history dot colours).
- [ ] **Phase 4 — Nutrition tab (no add-food yet).** Macro tiles (remaining-to-
      target), logged meals, water tracker, copy-yesterday, date picker, drag-drop
      from library. **Verify (phone):** log an existing library food; macros roll up;
      four states.
- [ ] **Phase 5 — Library / Meal Builder.** Search (dropdown rules §9), collapsible
      cards, gram editor with live calc + `unitType`, save meals. **Verify (phone):**
      build a meal, save it, it appears in Nutrition drag-drop; dropdown selection
      works on touch (the blur-before-click bug does NOT reappear).
- [ ] **Phase 6 — Add-food: barcode + OFF.** `useBarcodeScanner` + `useCameraStream`,
      OFF lookup, serving-size detection, funnel to custom-food shape. CDN hardening.
      **Verify (phone):** scan a real barcode; OFF pre-fills; serving rescale correct;
      camera-denied shows error state with manual escape.
- [ ] **Phase 7 — Add-food: OCR photo.** `useLabelOcr`, downscale, `/api/ocr-label`,
      deterministic convert (§6), pre-fill, never-auto-save, blank-manual fallback.
      Wire Sentry on the endpoint before trusting it. **Verify (phone):** photograph a
      real SA label (one of the OFF-missing ones); numbers transcribe; kJ→kcal +
      per-100g correct vs a hand calc; a deliberately blurry photo falls back to blank
      manual with the "couldn't read" line.
- [ ] **Phase 8 — Dashboard.** §5.1 exactly: trend hero, macro bars, weight chart.
      **Verify (phone):** every number matches the old dashboard on the same day.
- [ ] **Phase 9 — Four-states sweep, PWA polish, cutover.** Audit every surface vs
      §4.4 — the `STATUS.md` matrix (§9.2) must be fully ticked. Full phone pass
      installed-as-PWA. Then side-by-side week: both apps live on the same Supabase.
      Point primary usage at the new app; archive the old (repo kept, deployment
      paused) only after one full week of real logging with zero regressions and zero
      numeric drift. **Verify:** one complete real day — weigh in → scan a food →
      photo a label → log meals → dashboard reflects it — done entirely in the new
      app, numbers matching the old.

---

## 11. DEFERRED LOG — CAPTURED, NOT IN SCOPE

| Item | Trigger to revisit |
|---|---|
| Weekly Check-In report (§0.2) | If an automated report earns its place at multi-user, or the owner asks for it back |
| Offline logging (§0.3) | Multi-user, or repeated gym-signal loss during real logging |
| Adaptive TDEE engine + AI coaching-voice layer | Phase 2 PRODUCT work — should land and stabilise BEFORE this migration runs (§0.1), not inside it |
| Native app (App Store / Play) | Owner's later decision. Path: Capacitor-wrap the PWA, or Expo rebuild reusing logic |
| Multi-user, real auth, RLS tightening, POPIA consent, delete-account/export, Sentry beyond OCR | The "last chunk" — Phase 4 of the product, when anyone else uses it |
| Custom domain | With the above |
| Voice food-logging | Phase 3.5 in the product roadmap — post-migration, suits component UI |

---

*End of master plan. Claude Code: re-read §1, §6, and §9 at the start of every
session. Do not start Phase 0 until the §0.1 trigger fires and the Coach-migration
precondition is met. When this document and improvisation disagree, this document
wins — except on nutrition rules, food data, and the arithmetic principle, where the
Project Instructions win.*
