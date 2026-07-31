# plan.md — nutrisa-next migration phases

Live checklist. One phase = one branch = one fresh Claude Code session. Tick a box
ONLY when the branch is merged to `main` — never on "mostly done". Full detail for
each phase is in `docs/MIGRATION_PLAN.md` §10. Do not start a phase until the
previous one is merged.

| Done | Phase | Branch | Merged (date) |
|------|-------|--------|---------------|
| [x] | 0 — New repo, scaffold, tokens, PWA shell, tab nav, repo-memory files | `phase-0-scaffold` | 2026-07-31 |
| [ ] | 1 — Deterministic engine + first Vitest tests (correctness oracle) | `phase-1-engine` | |
| [ ] | 2 — Supabase data layer (typed client, 4 existing tables, no schema change) | `phase-2-data` | |
| [ ] | 3 — Weight tab (chart + trend + target + goal, filter, history, date picker) | `phase-3-weight` | |
| [ ] | 4 — Nutrition tab (macro tiles, logged meals, water, copy-yesterday) | `phase-4-nutrition` | |
| [ ] | 5 — Library / Meal Builder (search, gram editor, unitType, save meals) | `phase-5-library` | |
| [ ] | 6 — Add-food: barcode + Open Food Facts | `phase-6-barcode` | |
| [ ] | 7 — Add-food: OCR photo (+ Sentry on the endpoint) | `phase-7-ocr` | |
| [ ] | 8 — Dashboard (trend hero, macro bars, weight chart) | `phase-8-dashboard` | |
| [ ] | 9 — Four-states sweep, PWA polish, side-by-side cutover | `phase-9-cutover` | |

Cutover rule (Phase 9): archive the old app only after ONE full week of real
logging in the new app with zero regressions and zero numeric drift.
