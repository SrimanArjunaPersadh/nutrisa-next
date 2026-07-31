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

## Design tokens (hex lives in the /styleguide route, not in components)
Surfaces: `--bg` `--bg2` `--bg3` `--border`. Semantic: `--blue` (primary/nav/
progress), `--green` (loss/goal/success), `--red` (gain/over-target/alert), `--amber`
(warning). Macro colours reserved for their macro ONLY: `--protein` `--carbs`
`--fats`. Dark-first always. Type: Barlow Condensed 800 italic (stats/titles) +
Barlow 400–600 (body), via `next/font`, `tabular-nums` on data. Touch targets ≥44px.

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
