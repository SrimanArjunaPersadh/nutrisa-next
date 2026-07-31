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

## Still needed (deferred, not blocking the trend oracle)

- `custom_meals.json` — a handful spanning `unitType` values (`g`, `ml`, `slice`,
  `piece`, one volume) to oracle `macrosForQuantity`.
- `meal_logs` one real day — to oracle a day's macro roll-up.
Export these from Supabase the same way; apply no offset (meal macros aren't personal
health data the way bodyweight is, but strip `id`/`created_at` as noise).
