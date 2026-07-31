# tests/fixtures

## weight_logs.json

The correctness oracle for `trendWeight`, `weeklyRate`, and `eta` (Plan §6).

**Offset applied.** Every `weight` and `expectedTrend` is shifted by `_meta.offsetKg`
(−9.0 kg) from the real values. This repo is public, and bodyweight is Special
Personal Information under POPIA. The offset preserves every *relationship* between
consecutive values, so exponential-smoothing trend, weekly rate, and ETA all compute
identically — the algorithm doesn't care about absolute magnitude, only deltas.
Reverse by subtracting `offsetKg` if you ever need the real numbers (you shouldn't).

**Trend algorithm is the ORACLE formula, not the clean Plan §6 line.**
`tw[i] = round(0.1*w[i] + 0.9*tw[i-1], 2)`, seeded `tw[0] = w[0]`. The old app rounds
to 2 dp on every step and feeds the *rounded* value forward. This drifts from the
clean unrounded formula over a long series. We match the old app for oracle fidelity
(decision locked 2026-07-31, Phase 1). The §6 formula line is amended to match. If
NutriSA ever fully cuts from the old app, switching to the clean formula is a
deliberate future decision with its own re-verification — not a cleanup.

**`expectedTrend`** is the value each function must reproduce (as a number; formatting
is a display-phase concern — engine returns numbers, tests assert numbers).

**`screenConfirmed`** (4 rows only) is the trend value read off the OLD app's screen
on 2026-07-31, offset applied. All four matched the oracle computation to the app's
display precision (1 dp). The 24 Jul row is the important one: it sits just after a
37-day gap, the case most likely to expose drift, and it matched — this is what makes
the computed oracle trustworthy rather than circular.

**Gaps are load-bearing.** 37-day gap 17 Jun → 24 Jul, plus two 4-day gaps in June.
Missing dates mean no weigh-in occurred — the series is genuinely sparse, not
truncated. The trend feeds the last known value forward across gaps (the old app's
behaviour); the 24 Jul row tests exactly this. Do not "fill in" missing dates.

## meal_logs.json · custom_meals.json · custom_foods.json

Added in Phase 2. Real rows pulled from the live DB (project `ajajsaquxmimsdxbueqb`)
on 2026-07-31. **These close the gap Phase 1 left open** — `macrosForQuantity` is now
oracled against STORED rows, not only `FOOD_DB` literals.

**No offset, unlike `weight_logs.json`.** Macros cannot be shifted the way bodyweight
can: an offset would destroy the `qty × perUnit` relationships that are the thing under
test. So every macro is **verbatim**. What is scrubbed is row `id`s, replaced with
synthetic sequential UUIDs. Dates and product names are real — a product name is not
personal information in the way bodyweight is.

**`expected` is an INDEPENDENT transcription.** Each fixture's `expected` values were
produced by transcribing the old app's mapping code (`old-index.html` 1895–1905,
1935–1946, 1959–1969, and `foodMacros` 900–919) in a generator script, *not* by calling
`lib/data`. Two separate transcriptions of the same source must agree — that is what
makes these an oracle rather than the mapper marking its own homework.

Three things in this data are load-bearing and must not be "tidied":

- **`meal_logs` 2026-06-03 has `sort_order` `[3,3,3,4,8]`** — duplicates *and* a gap.
  Real: a delete never renumbers, so the next insert reuses a length. `sort_order` is
  also **1-based**, not 0-based (PHASE-2-DECISIONS §5).
- **The two ingredient columns disagree.** `meal_logs.ings_json` is a JSON *string*
  with bare `qty` (`"80"`); `custom_meals.ingredients` is *jsonb*, already parsed, with
  a unit-suffixed `qty` (`"80g"`). Both are strings. This is the sharpest mapping
  hazard in the phase.
- **`custom_foods` units include `"2 biscuits"` and `"pops"`** — live proof that
  `unitType` had to be typed open (PHASE-1-DECISIONS §6).
