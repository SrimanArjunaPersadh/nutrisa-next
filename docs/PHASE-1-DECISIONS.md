# PHASE 1 DECISIONS — deterministic engine

**Date: 2026-07-31 · Branch: `phase-1-engine` · Owner + Claude Code**

Decisions taken during the Phase 1 interview, before any code was written. The
Migration Plan remains the authority; where this file amends it, the amendment is
recorded in the Plan's own changelog (v1.2) as well as here.

---

## 1. The §6 trend formula was WRONG in the Plan. Amended.

**Found:** the Plan §6 froze `tw[i] = 0.1*w[i] + 0.9*tw[i-1]`. The old app
(`docs/reference/old-index.html` line 532) rounds to 2 dp on **every step** and
feeds the **rounded** value into the next step:

```js
o.push({date: ws[i].date, tw: +(a * ws[i].w + (1-a) * o[i-1].tw).toFixed(2)});
```

Those are different algorithms. The rounding compounds: across the 36-row fixture
the clean formula ends at `88.87392…` where the old app ends at `88.88` — a drift
of −0.0061 kg that never reconverges and would show as a different number at the
app's 1 dp display precision on some days.

**Ruling: the oracle wins.** §6's formula line is amended to
`tw[i] = round(0.1*w[i] + 0.9*tw[i-1], 2)`, 2 dp fed forward.

This is a **fidelity choice, and it is mildly worse numerically** than the clean
formula — per-step rounding introduces error the clean version does not have. It
is kept solely so the new app reproduces the old app's displayed numbers during
the side-by-side cutover week (Plan §10 Phase 9). Do **not** "clean it up" later
without a deliberate re-verification pass against real screen values.

Two implementation details that are part of the frozen behaviour:

- **The seed is unrounded.** `tw[0] = w[0]`, the raw first weigh-in. Only
  subsequent steps round. The asymmetry is the old app's.
- **Rounding is `+n.toFixed(2)`, not `Math.round(n * 100) / 100`.** The two agree
  on the current fixture but diverge on exact-half decimal representations, and
  `toFixed` produced every oracle value. `lib/engine/trend.ts` says so in a
  comment; do not swap it.

## 2. Empty series returns `no-data`, not "Goal reached!" — ORACLE EXCEPTION

The old app's `eta()` answers **"Goal reached!"** on an empty series, because
`lw()` returns `0` and `0 <= 88`. That is a defect, not a behaviour.

**Ruling: deliberate departure.** `eta([])` returns `{ kind: "no-data" }`. No
stored row can produce the old path (the DB has never been empty), so no oracle
value is violated. This is the ONLY place Phase 1 knowingly returns a different
answer from the old app. It is an oracle exception, not a translation error — if
a future phase finds a numeric mismatch, this is not the cause.

## 3. "Byte-for-byte" restated — the engine returns numbers, never strings

Formatting is a display-phase concern. Dragging it into Phase 1 would pull
rounding, locale and unit-string logic into the pure-math layer — exactly what §6
wants kept clean and testable.

**Restated:** the engine returns the number that, passed through the old app's
formatter, reproduces the old app's displayed string.

The sharp edge, and the rule that resolves it:

> **Rounding that changes a number we persist or feed into further arithmetic is
> ENGINE. Rounding that only changes rendered text is DISPLAY.**

So `macrosForQuantity`'s `Math.round` / `toFixed(1)` stay in the engine — those
values are written to `meal_logs` and rolled into day totals. `trendWeight`'s
per-step rounding stays, for the same reason (it feeds the next step). The OCR
pre-fill's `round1` (old app line 1577) does **not** — it only fills a form box,
and it lands in Phase 7.

Consequence: `eta` returns a tagged result (`no-data` / `reached` / `projected`
+ `Date`), never the old app's `"Goal reached!"` or `"12 Aug 2026"` strings.

## 4. `eta` bugs carried forward, deliberately

Both are the old app's behaviour and both are preserved unchanged:

- It projects at an **assumed 0.5 kg/week**, NOT the measured `weeklyRate`. The
  ETA answers "when would I arrive at target pace", not "at current pace". The
  constant `RATET = 0.5/7` exists in the old app and line 560 ignores it.
- It counts forward from **today**, not from the last weigh-in. Stop weighing in
  and the projection quietly slides.

`today` is now an injected parameter rather than an internal `new Date()`. Same
value, but the function is pure and testable.

## 5. Fixtures — real rows, offset, screen-confirmed

`tests/fixtures/weight_logs.json`: 36 real `weight_logs` rows, offset **−9.0 kg**
for POPIA (this repo is public; bodyweight is Special Personal Information). The
offset preserves every relationship between consecutive values, so trend, rate and
ETA compute identically.

Four rows carry `screenConfirmed` — trend values read off the OLD app's screen on
2026-07-31, all matching to the app's 1 dp display precision. This is what makes
the computed `expectedTrend` column an oracle rather than circular self-marking.
The 24 Jul row is the important one: it sits just past the gap, the case most
likely to expose drift.

**The 37-day gap (17 Jun → 24 Jul) is intentional and load-bearing.** Missing
dates mean no weigh-in happened. `trendWeight` steps once per **entry**, never per
calendar day, so the hole is a single smoothing step. **Do not fill missing
dates** — the 24 Jul row is the test that catches anyone who does.

**Still outstanding:** `custom_meals` and one real `meal_logs` day, to oracle
`macrosForQuantity` against stored rows. Deferred by agreement; Phase 1 proceeds on
the trend/rate/eta oracle. In the meantime `macrosForQuantity` is tested against
real `FOOD_DB` rows lifted verbatim from the old app (lines 823–896), which are
self-contained input → expected-output cases and are the same objects
`foodMacros()` runs against in production.

## 6. Smaller rulings

| Decision | Ruling |
|---|---|
| `perServingToPer100g` | One unrounded pure function + named inverse `per100gToPerServing`. The Save path's 2 dp rounding (old line 1796) stays at the call site — it is a storage decision, not part of the conversion |
| OCR clamp guards | Ported now, not deferred to Phase 7. `atwaterCheck` cannot be tested faithfully without them: clamping runs first and changes what Atwater sees |
| Atwater tolerance | `0.20` as a defaulted parameter, relative to the LABEL's kcal (not the estimate). Declines to judge a partial read, and declines on a zero-calorie product |
| `unitType` | Typed **open** (`"g" \| "ml" \| (string & {})`), not a closed union. `cfSave` lets the user type any unit name, and `FOOD_DB` already ships `steak`, `sausage`, `biscuit`, `scoop`, `spray`, `pinch`. The only distinction the arithmetic makes is `isGramUnit` |
| Sorting | Folded into `trendWeight`/`weeklyRate`/`eta` rather than left to callers. Every old-app call site sorts first via `sW()`; folding it in is identical on every real call and removes a silent-wrong-answer footgun for Phase 3 |
| Missing macro basis | Throws a typed error. The old app read through an undefined `per100` and crashed with a TypeError — same failure, better message |
| Negative quantities | Passed through unguarded, like the old app. The gram editor's minimum is a UI affordance, not an engine rule |
| Date parsing (added at `/review`) | `msFromIsoDate` parses the `YYYY-MM-DD` prefix, so a full ISO timestamp works too, and throws on anything unparseable. The old app's `new Date(x)` accepted both shapes; a naive `date + "T00:00:00Z"` would have yielded NaN on a timestamp and made `weeklyRate` return `null` — a missing rate with no error. Only divergence: for a timestamp with a non-UTC offset near midnight this takes the local calendar day, which is the right unit for a weigh-in |

## 7. CLAUDE.md corrections

- The §6 function list restated the clean trend formula. Amended to the oracle one.
- The `unitType` list (`g/slice/piece/tbsp/tsp/cup/ml`) was wrong: `cup` appears
  nowhere in the old app, and `steak`/`sausage`/`biscuit`/`scoop`/`spray`/`pinch`
  were missing. Corrected to describe the set as open with `g`/`ml` special-cased.

## Engine location

`lib/engine/` — `types.ts`, `trend.ts`, `nutrition.ts`, `macros.ts`, and an
`index.ts` barrel. Tests in `tests/engine/`, picked up by the existing
`tests/**/*.test.ts` glob. Nothing in `lib/engine/` may import React, Supabase or
any other dependency; these are pure functions and they stay that way.
