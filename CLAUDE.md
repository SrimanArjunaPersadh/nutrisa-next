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
  `water_logs`. Do not evolve them here. (Plan §2.)
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
`app/globals.css` is the one file in the repo containing a hex value, and each hex
appears exactly once — a Vitest test enforces both. `@theme` holds `--color-*`
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

## Deterministic functions to port (Plan §6) — pure, typed, Vitest-tested
`kJtoKcal` (÷4.184), `perServingToPer100g`, `atwaterCheck` (4/4/9), `trendWeight`
(exponential smoothing α=0.1: `tw[i]=0.1*w[i]+0.9*tw[i-1]`, frozen), `macrosForQuantity`
(qty×perUnit, respect `unitType`), `weeklyRate`/`eta` (calendar dates not indices;
ETA from trend not raw).

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

## Current phase
Phase 0 — scaffold, tokens, PWA shell, tab nav, repo-memory files. See `plan.md`.
