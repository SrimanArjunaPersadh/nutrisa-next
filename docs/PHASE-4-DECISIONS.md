# PHASE 4 DECISIONS — Nutrition tab

**Date: 2026-08-05 · Branch: `phase-4-nutrition` · Owner + Claude Code**

Decisions taken during the Phase 4 interview, before any code was written. The
Migration Plan remains the authority; where this file amends it, the amendment is
recorded here and in the Plan's changelog.

All line numbers refer to `docs/reference/old-index.html`. Its nutrition surface is
`vN()` at 2749–2857, the day totals `tot()` at 513–517, the macro bars `mac()` at
2730–2747, the targets at 439–444, copy-yesterday `copyYesterdayMeals()` at
2044–2071, and the orphaned water chain at 172–176 / 813–818 / 3640–3650.

Phase 3 set the precedents this phase inherits: the four-states hook shape (§8),
the Undo-toast-not-confirm ruling (§6), and Plan-beats-old-screen where the two
disagree (§1). Where Phase 4 follows one of those, it says so rather than
re-arguing it.

---

## 1. The water tracker is CUT. It was never reachable.

**Found:** the old app's water feature does not run. `.water-track` and
`.water-cup` are styled (172–176), `adjustWater()` is defined (3642), and
`waterGoal()` / `isSeitanDay()` / `waterCups()` are defined (813–818) — and
**nothing calls any of it**. `adjustWater` has zero call sites, so the entire
chain below it is unreachable, and `.water-track` markup is never emitted by any
view function. The `water_logs` table holds a single row from some earlier build.

That means there is no oracle. Plan §6's gate — "WRONG until it reproduces the old
app's displayed value" — cannot be applied to a screen that has never displayed
anything. Shipping it would be reconstruction from dead code, not translation.

**Ruling (owner, 2026-08-05): cut the feature.** Not deferred to Phase 9 — cut.
Water tracking leaves the app.

**This amends the Plan's closed feature inventory (§3) and §5.2's "water tracker
inline".** The no-invented-features rule (§3) requires a dated note to ADD a
feature; removing one from a closed inventory is the same kind of change and gets
the same treatment. This is that note.

Consequences, all deliberate:

- **No schema change.** `water_logs` stays exactly as it is. The five-table rule
  (§2) is about the database, not about which tables we read.
- **`lib/data/water.ts` STAYS.** It is merged, tested Phase 2 code that costs
  nothing to keep and would cost a re-derivation to bring back. It is now unused
  by any surface. Do not read this as a feature waiting to be wired — the feature
  is cut; the module is just the door left unlocked.
- **`isSeitanDay` is not ported.** The 12-vs-14-cup rule (a logged meal whose name
  contains "seitan" raises the goal) dies with the feature. It only ever existed
  to feed `waterGoal()`.
- **STATUS.md gains no water row**, and the Nutrition row does not carry water
  states.

## 2. Macro tiles show REMAINING. Plan §5.2 wins over the old screen.

**Found:** `vN()`'s four tiles render consumed totals against a static range
subtitle — `${t.kcal}` over `2200–2400`, `${t.pro}g` over `175–175g`. Plan §5.2
asks for "macro tiles (remaining-to-target)".

**Ruling: remaining.** Same shape of call as Phase 3 §1, where Plan §5.3's trend
line beat the old chart: the Plan is describing the question you open the app to
ask, and "how much is left" is that question. The old app makes you do the
subtraction in your head at 19:00 with the fridge open.

**Remaining counts down to the CEILING, which is what the bars already do.**
`mac()` uses `pct(v, MAX)` for all four rows (2738, 2744), so `MAX` is already the
denominator the old app measures progress against:

| Tile | Remaining | Ceiling |
|---|---|---|
| Calories | `KCAL_MAX − kcal` | 2400 |
| Protein | `PRO_MAX − pro` | 175 |
| Carbs | `CARB_MAX − carb` | 210 |
| Fat | `FAT_MAX − fat` | 65 |

Protein is unambiguous by luck: `PRO_MIN === PRO_TARGET === PRO_MAX === 175`
(440), so counting down to the ceiling and counting down to the target are the
same arithmetic.

**Over the ceiling shows as over, never as a negative or a floor at zero.** A
tile reading `−140` is a puzzle; `140 over` is a sentence. The colour carries the
same meaning it does everywhere else in the app (§1.5).

**Tile colours port `bc()` (518) and the tile classes exactly** — over max is
`--red`, at or above min is `--green`, below min is `--blue`. That logic is
unchanged; only the number it sits next to is.

**No stored value changes and no total changes.** The tiles are a different view
of the same `tot()` arithmetic, which is why this is not an oracle violation: the
consumed figure is still computed identically and still shown, in the bars.

## 3. Scope — what the Nutrition page is in Phase 4

| Block | Source | Phase 4? |
|---|---|---|
| Date picker header | 2778 (`renderDatePicker(S.mdate)`) | Yes — reuses the Phase 3 component |
| Four macro tiles | 2780–2785 | Yes, as REMAINING (§2) |
| Macro bars (kcal + 3 macros) | `mac()`, 2730–2747 | Yes, consumed-vs-ceiling, unchanged |
| Saved Meals list, grouped by category, `+` to log | 2800–2840 | Yes, WITHOUT search (§4) |
| Logged list: name, time, kcal, macro line, delete | 2751–2775 | Yes |
| Logged row expand → gram/ingredient editor | `loggedItemEditor` | **No — Phase 5** |
| Copy Yesterday | 2044–2071 | Yes, re-ruled (§6) |
| Quick Log (free-text ingredient search) | `qlRenderWidget`, 2311 | **No — Phase 5** |
| Water tracker | — | **No — CUT (§1)** |

**The expandable editors are the Phase 4/5 seam.** Plan §5.4 gives the "expandable
gram editor with live macro calc respecting `unitType`" to Phase 5, and both the
logged-row editor and Quick Log are that same editor wearing different hats. A
logged meal in Phase 4 can be logged and deleted, not re-portioned.

## 4. The picker — category list and a `+`, no search

**Ruling (owner): port the Saved Meals list grouped by `CATS` with its `+` button
(2800–2840); leave the search box and its results dropdown to Phase 5.**

This is the smallest thing that satisfies the Plan's own Phase 4 verify step ("log
an existing library food; macros roll up") without pulling Phase 5's work forward.

**It also keeps the dropdown rule out of Phase 4 entirely.** The rule
(`onMouseDown` + `preventDefault()`, click-outside-to-close, Enter/Escape) governs
the search results dropdown, which is the thing not being built. Phase 4 ships no
custom dropdown. When Phase 5 adds search, that rule is the first thing its
interview must confront.

### 4a. Found at build time — the old grouping loses meals

`vN()` builds the library list as `CATS.map(cat => meals.filter(m => m.cat ===
cat))` (2800–2802), where `CATS` is exactly
`['Breakfast','Lunch','Supper','Pre-Workout']` (447). A saved meal whose `cat` is
anything else is **silently dropped** — it exists in `custom_meals`, it is counted
nowhere, and no screen can reach it. `rowToCustomMeal` maps a null `cat` to `""`
(`mappers.ts:166`), so the database can produce exactly such a row, and Phase 5's
meal builder will be able to create one.

All four fixture meals carry a real category, which is precisely why this would go
unnoticed until the day it did not.

**Ruling: group by `CATS` in the old app's order, then collect anything left over
under an `Uncategorised` heading.** `lib/meal-categories.ts`, tested. Empty
categories are still omitted, matching `if (!meals.length) return ''` (2802).

This changes no number and no stored value; it makes a previously unreachable row
reachable. An ugly heading beats an invisible meal.

## 5. Drag-drop is dropped. It never worked on a phone.

**Found:** the old library cards are `draggable="true"` with `ondragstart` /
`ondragend`, dropping into a zone with `ondragover` / `ondrop` (2805–2807, 2851).
That is HTML5 drag-and-drop, which does not fire on touch. On the target device
the old app's only working log paths are the `+` button and Quick Log.

**Ruling (owner): tap-to-log is the only path. The drag handlers are not ported.**

**This amends Plan §5.2's "drag-drop from library is PRESERVED".** Nothing real is
lost, because there is nothing working to preserve — §5.2 is describing a laptop
affordance in a phone-first app. Rebuilding it properly with pointer events was
considered and rejected: it is genuinely new interaction code, fiddly to get right
on mobile, and it would be the only feature in the migration whose phone behaviour
has no precedent at all.

## 6. Copy Yesterday — no `alert`, no `confirm`, an Undo toast

**Found:** `copyYesterdayMeals()` (2044) opens with `alert('No meals logged
yesterday')` and gates on `confirm('Copy N meals…')`. It then loops the source
meals, pushing and rendering and awaiting `cloudAddMeal` one at a time, guarded by
a module-level `_copyInFlight` flag.

**Ruling: follow the Phase 3 §6 precedent.** No confirm before the action; an Undo
toast after it, naming what happened (`Copied 5 meals from 4 Aug`) and offering to
put it back. Undo deletes exactly the rows the copy created — it holds their ids,
so it cannot delete a meal you logged by hand in between.

"Nothing logged yesterday" is not an alert either. It is the button's own disabled
state with the reason on it, which is knowable BEFORE the tap and so should never
have been a dialog.

**The `_copyInFlight` guard is kept**, as request state on the button rather than a
module global. Copy-yesterday is the one action here that fires N writes from one
tap, and a double-tap genuinely doubles the day.

**`time` is stamped fresh per copied meal** (`now()`, 2060), not carried from the
source row. Carried forward deliberately — the old app is right that the copy
happened now.

## 7. Engine additions — `lib/engine/day.ts`

Day totals are arithmetic that feeds tiles, bars and colours, so they are engine,
not display (§6 boundary, same reasoning that put the mappers' read-rounding in
Phase 2).

1. **`dayTotals(meals)`** — ports `tot()` (513–517) exactly, including its
   rounding: `Math.round(kcal)` and `+toFixed(1)` on protein, carbs and fat.
   Summing happens on the UNROUNDED per-meal values and rounds once at the end,
   which is what the old app does.
2. **The targets, as named constants** — `KCAL_MIN/TARGET/MAX`, `PRO_MIN/TARGET/MAX`,
   `CARB_MIN/MAX`, `FAT_MIN/MAX` (439–442). Values frozen; they are the old app's.
3. **`remaining(consumed, ceiling)`** — returns a signed number, negative when
   over. The view decides how to say it (§2); the engine only subtracts.
4. **`macroStatus(value, min, max)`** — ports `bc()` (518) as
   `'over' | 'in-range' | 'under'` rather than returning a colour string. The
   engine returns meaning; the view maps meaning to `--red` / `--green` / `--blue`.
   Same discipline as `eta`'s result union and `weightDirections`.

`pct(v, mx)` (518) is bar geometry — a width, not a nutrition fact — and stays in
the component.

## 8. Data — `useDay(date)`, following the Phase 3 §8 hook shape

**Ruling: one hook, `useDay(date)`, exposing
`{ meals, state, error, refetch, log, remove, copyYesterday }`** with the same
`'loading' | 'error' | 'empty' | 'ready'` union that made the four-states rule a
type error in Phase 3. The write helpers refetch on `ok` and return the write's own
`Result` unchanged, per §8a.

Same two contracts as `useWeights`, for the same reasons: a failed WRITE never
moves the list into its error state, and out-of-order responses are discarded by
sequence number. The date is a dependency, so switching days re-reads.

**`sort_order` comes from the caller as `meals.length + 1`**, 1-based, per
PHASE-2-DECISIONS §5. The hook holds the day's list, so the hook is the caller that
knows it. Nothing else should be computing it.

**Copy-yesterday reads the source day with `fetchMealsForDate(yesterday)`**, not
`fetchAllMeals()`. Phase 2's own note on `fetchAllMeals` warns it grows without
bound; one extra day-read is the cheaper and more honest call.

### 8a. Still NOT optimistic — but the trigger is armed

Phase 3 §8 named "high-frequency MEAL logging in Phase 4" as the trigger to
reconsider optimistic updates. It fires, and the answer is still no — for now.

The Phase 3 argument was that a refetch round-trip is imperceptible. That argument
survives here better than expected, because `useDay` refetches ONE DAY's meals
(typically 4–8 rows), not a full history. What changed is tap frequency, not
payload size.

**Revisit trigger, sharpened: if tap-to-log feels laggy on the actual phone on
actual mobile data, optimistic updates land in a follow-up pass, not a rewrite.**
The hook shape above is deliberately the one that can absorb them — the writes are
already inside it.

## 9. Four states on this surface

- **Empty** — a day with no meals logged. An invitation to act (§4.4): the Saved
  Meals list is right there, and Copy Yesterday is the one-tap path. NOT the old
  app's drag-drop prompt (2752–2756), which names an interaction that no longer
  exists (§5).
- **Loading** — skeleton in `--bg3`, tiles and list.
- **Error** — a failed day-read keeps the last good rows under a visible error, per
  §8a. A failed log or delete surfaces at the button and in the toast, and does not
  blank the day.
- **Happy** — meals logged, tiles counting down, bars filling.

An empty day is genuinely empty (`state: 'empty'`), unlike Weight where `empty`
meant "no weigh-ins ever". A day with nothing logged is the normal state of every
morning, so the Empty state here is a surface you see daily, not an onboarding
screen. It gets designed accordingly — no "welcome", no explanation of what
NutriSA is.
