# plan.md — nutrisa-next migration phases

Live checklist. One phase = one branch = one fresh Claude Code session. Tick a box
ONLY when the branch is merged to `main` — never on "mostly done". Full detail for
each phase is in `docs/MIGRATION_PLAN.md` §10. Do not start a phase until the
previous one is merged.

| Done | Phase | Branch | Merged (date) |
|------|-------|--------|---------------|
| [x] | 0 — New repo, scaffold, tokens, PWA shell, tab nav, repo-memory files | `phase-0-scaffold` | 2026-07-31 |
| [x] | 1 — Deterministic engine + first Vitest tests (correctness oracle) | `phase-1-engine` | 2026-07-31 |
| [x] | 2 — Supabase data layer (typed client, 5 existing tables, no schema change) | `phase-2-data` | 2026-07-31 |
| [x] | 3 — Weight tab (chart + trend + target + goal, filter, history, date picker) | `phase-3-weight` | 2026-08-05 |
| [x] | 4 — Nutrition tab (macro tiles, logged meals, copy-yesterday, gram editor) | `phase-4-nutrition` | 2026-08-05 |
| [ ] | 5 — Library / Meal Builder (search, Quick Log, unitType portioning, save meals) | `phase-5-library` | |
| [ ] | 6 — Add-food: barcode + Open Food Facts | `phase-6-barcode` | |
| [ ] | 7 — Add-food: OCR photo (+ Sentry on the endpoint) | `phase-7-ocr` | |
| [ ] | 8 — Dashboard (trend hero, macro bars, weight chart) | `phase-8-dashboard` | |
| [ ] | 9 — Four-states sweep, PWA polish, side-by-side cutover | `phase-9-cutover` | |

Scope notes for Phase 5, recorded in `docs/PHASE-5-DECISIONS.md`:

- **The Add Custom Food form ships manual entry ONLY** (§1). The barcode field,
  the Open Food Facts lookup, the camera viewfinder and the `cfServing`
  per-serving view all arrive in Phase 6; "photograph the label" in Phase 7. No
  control is stubbed — a button that does nothing is worse than a button that is
  absent.
- **Food identity is the row id, not the name** (§6). This diverges from the old
  app, which merges a custom food and a built-in of the same name into one
  composer row and uses one food's macros for both. It is a divergence that
  changes a NUMBER, allowed because the old number came from a defect rather than
  a rule, and because no existing row exhibits the collision.
- **Quick Log and the log editor's "Add Item" land on the Nutrition page**, not
  the Library — that is where the old app puts them (2843, 3403).

Two scope changes made during Phase 4, both recorded in
`docs/PHASE-4-DECISIONS.md` and amending the Plan's closed feature inventory (§3):

- **The water tracker is CUT** (§1). The old app's water UI was unreachable dead
  code — `adjustWater` had zero call sites — so there was no oracle to translate.
  `water_logs` is untouched; `lib/data/water.ts` remains as unused, tested code.
- **The gram editor moved from Phase 5 to Phase 4** (§3a). Re-portioning a LOGGED
  meal is pure proportion on its stored ingredients and needs no food database.
  Portioning a food fresh from the library — §5.4's `unitType` clause — is still
  Phase 5, along with search, Quick Log and the editor's "Add Item" widget.

Cutover rule (Phase 9): archive the old app only after ONE full week of real
logging in the new app with zero regressions and zero numeric drift.
