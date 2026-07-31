# docs/reference

## old-index.html

The OLD NutriSA app — the single-file vanilla version this repo is a TRANSLATION
of (Plan §0.1). Kept in the repo so a fresh Claude Code session can read the
ancestor implementation directly instead of deriving behaviour from scratch.

**It is a reference, not a dependency.** Nothing in `app/`, `lib/` or `tests/`
imports it. It is never built, linted or shipped.

### Redacted

`SB_URL` and `SB_KEY` (lines 1838–1839) and the Supabase origins in the CSP meta
tag (line 9) are replaced with `REDACTED` placeholders. The key was the **anon**
key, which is public by design (Plan §2) and already published with the old app —
but there is no reason for the translation reference to carry it, so it doesn't.
Nothing else was altered.

This copy was supplied by the owner on 2026-07-31 and is believed to be
`feat/ocr-label` @ `e7169e9` (the commit Plan §3 adjudicated the feature inventory
against). That provenance has NOT been machine-verified — the old repo was not
reachable from this session. If a ported function ever disagrees with the live old
app, re-check this file against the real commit before assuming the port is wrong.

### The functions Phase 1 ported

| Old | New | Line |
|---|---|---|
| `tL(ws)` | `trendWeight` | 527 |
| `wr()` — FIX #1 | `weeklyRate` | 538 |
| `eta()` — FIX #2 | `eta` | 554 |
| `isGramUnit` / `foodMacros` | `isGramUnit` / `macrosForQuantity` | 900 |
| inline `/4.184` (OFF + OCR paths) | `kJtoKcal` | 1453, 1558 |
| inline `100/serving` rescale | `perServingToPer100g` + inverse | 1299, 1567, 1796 |
| inline clamp + Atwater warn | `clampLabelMacros` / `atwaterCheck` | 1574, 1589 |

Rulings taken while porting these — including the two places the new code
deliberately differs — are in `docs/PHASE-1-DECISIONS.md`.
