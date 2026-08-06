# PHASE 5 DECISIONS — Library / Meal Builder

**Date: 2026-08-06 · Branch: `phase-5-library` · Owner + Claude Code**

Decisions taken during the Phase 5 interview and its engineering review, plus the
rulings taken at build time. The Migration Plan remains the authority; where this
file amends it, the amendment is recorded here.

All line numbers refer to `docs/reference/old-index.html`. This phase's surfaces
are `vLib()` at 3108–3182, the meal builder `mbRenderBuilder()` at 1093–1128 with
`mbSave()` at 1054, the Add Custom Food form `cfRenderForm()` at 1134–1234 with
`cfSave()` at 1740, Quick Log `qlRenderWidget()` at 2311–2349 with `qlLogAll()` at
2270, the food database `FOOD_DB` at 822–897, `searchFoodDB()` at 937, and the
log editor's Add Item widget `logAddSearchWidget()` at 3403.

Phase 3 set the precedents this phase inherits: the four-states hook shape (§8),
Undo-toast-not-confirm (§6), and Plan-beats-old-screen where the two disagree
(§1). Phase 4 added the remaining-tiles ruling and the gram editor. Where Phase 5
follows one of those it says so rather than re-arguing it.

> **A NOTE ON THIS FILE'S HISTORY.** T1–T5 shipped in commit `5bbfb52` while this
> document existed only in the planning session, so the code carries references —
> "eng review D3", "R1", "R7" — to a file that was not in the repo. This is that
> file, written after the fact from those references and from the code they
> describe. Sections marked **(reconstructed)** were rulings taken in the
> planning session; sections without the mark were taken at build time on
> 2026-08-06 and are recorded first-hand.

---

## 1. Scope — what the Library phase is

Plan §10 puts search, Quick Log, `unitType` portioning and save-meals in this
phase. In full, what ships:

| Ships | Where |
|---|---|
| Ingredient search over `FOOD_DB` + `custom_foods` | `lib/food-search.ts`, `components/library/food-search.tsx` |
| The meal builder — search, rows, live macros, save | `components/library/meal-builder.tsx` |
| Add Custom Food, manual entry only | `components/library/add-custom-food.tsx` |
| Saved meals by category, gram editor, log-to-today | `components/library/library-meal.tsx` |
| Quick Log | `components/nutrition/quick-log.tsx` |
| The log editor's "Add Item" widget | `components/nutrition/meal-editor.tsx` |
| `unitType` portioning at the input | `lib/units.ts` |

What does NOT ship, and why:

- **The barcode field, the "Look up" button and the camera viewfinder** —
  Phase 6. They are all on the old Add Custom Food form (1185–1200), and building
  the input now would ship a control that does nothing.
- **"Photograph the label" / OCR** — Phase 7 (1204).
- **The `cfServing` per-serving view** (1236–1330). It only ever activates from
  `cfLookup`, which is the barcode path, so it arrives with Phase 6.
- **The Atwater sanity check.** `atwaterCheck` has been in the engine since
  Phase 1, but the old app applies it only on the OCR path (1586). Wiring it to
  manual entry would be a new feature (Plan §3).

**Consequence of stripping the barcode field:** every food saved in Phase 5 has
`barcode: null`, so `saveCustomFood` always takes the upsert-on-`name` branch —
the branch PHASE-2-DECISIONS §9 records as never having run against real data.
See §9 below.

---

## 2. `FOOD_DB` is SOURCE, not data (reconstructed — premise 3)

The 74 built-in foods are a constant in the old app and they are a constant here,
in `lib/food-db.ts`. They are not seeded into `custom_foods`.

Seeding them would be a data change wearing a port's clothes, and it would break
the thing that decides search ties: the pool is `[...FOOD_DB, ...customFoods]`
(943) and results are capped at 8, so **the built-ins-first ordering decides which
foods a user can actually reach** on a crowded query.

**The transcription is machine-verified.** `tests/food-db.test.ts` parses the
`FOOD_DB` literal straight out of `docs/reference/old-index.html` and compares it
field by field. A typo in one macro is a wrong number in every meal built from
that food, so it is not checked by eye.

---

## 3. D3 — the search pool gets its own type, not a widened `Food`

`SearchableFood = Food & { name, cat, defaultQty, unitLabel? }`.

The engine's `Food` carries only `unit` plus one macro basis — everything
`macrosForQuantity` computes with, and nothing else. Widening it to hold a name
and a category would put display concerns on the arithmetic input, which is the
boundary Plan §6 exists to defend.

`CustomFood` is structurally assignable to `SearchableFood`, which is what lets
the pool mix built-ins and user rows with no adapter.

---

## 4. D4 — the PAGE owns `useCustomFoods()`; the pool is a prop

`FoodSearch` takes `pool` as a prop and never calls a hook for it.

Up to three search boxes can be mounted at once on Nutrition — Quick Log plus one
Add Item per open editor — and a hook per mount would mean three reads of one
table, three loading states, and three copies of the truth that drift apart. Both
pages call `useCustomFoods()` exactly once and pass `foodPool(foods.foods)` down.

This is the pattern already running at `app/(tabs)/nutrition/page.tsx`, where the
page owns `useCustomMeals()` and hands `library={library.meals}` to `LoggedList`.

A failed custom-foods read degrades search to the built-in 74 rather than
breaking it, and the Library page says so above the builder.

---

## 5. D5 — quantity inputs must ask `unitStep`, never assume grams

`lib/units.ts` ports `unitDisplayLabel` (911), `unitStep` (919) and `unitMin`
(924). These are DISPLAY, not engine: a label, a stepper increment and a floor.
No nutrition fact is computed by any of them.

The bug this exists to prevent is in the old app itself: the saved-meal editor
hardcodes `step="5"` regardless of unit (725), so a steak steps 1 → 5 → 10.
Anything rendering a quantity input asks `unitStep(food)`.

**Where the old app's hardcoded 5 is KEPT:** `LibraryMeal`'s gram editor and the
logged-meal editor. A stored ingredient is a bare number with no food record
attached — there is no `unit` to read — so `unitStep` has nothing to work from
and 5 stands.

`PLURALS` is deliberately incomplete and carried forward that way: `sausage` and
`biscuit` are units in `FOOD_DB` and appear in neither the map nor the gram-unit
branch, so they render as "2 sausage". Pinned by test so nobody tidies it.

---

## 6. D6 — food identity is the id, NOT the name

`foodIdentity(food) = food._id ? "id:"+_id : "name:"+name`.

**This is a divergence from the old app, and it fixes a silent wrong-number bug.**
`mbAddIng` tops up an existing composer row when `i.f.name === food.name`
(980) while the pool is `[...FOOD_DB, ...customFoods]` with no dedupe. So a custom
food you named "Banana" and the built-in Banana collapse into ONE row that keeps
whichever arrived first and uses its macros for both. Wrong numbers, no warning,
and **the correctness oracle cannot catch it because both apps agree** — the old
app produced the wrong number too.

Two built-ins can still never collide: `FOOD_DB` has no duplicate names, pinned in
`tests/food-db.test.ts`.

Per Plan §1's Plan-beats-old-screen principle this is a divergence that changes a
NUMBER, which normally would not be allowed. It is allowed here because the old
number was produced by a defect the old app's author did not intend, not by a
rule; and because the divergence only fires on a collision that no existing row
exhibits.

---

## 7. D7 — unusable foods are filtered at search, and SAID somewhere

A `custom_foods` row can carry a macro basis that does not match its unit —
`rowToCustomFood` attaches a basis only when the column is non-null. Handed to
`macrosForQuantity`, such a row THROWS, and with no error boundary that means a
dead screen on the installed PWA.

Three guards, all needed:

1. **Read side.** `isUsableFood` filters them out of `searchFoods` BEFORE the cap
   of 8, so a broken row cannot consume a slot a good one needed.
2. **Write side.** The Add Custom Food form refuses a per-unit food whose unit is
   `g` or `ml` (old app 1770), and falls back to `"unit"` rather than to grams
   when the unit name is blank (1775).
3. **`useComposer.add` refuses one**, returning `false`. It cannot arrive from
   the search box, but `add` is a public entry point.

**And the surface SAYS so.** `unusableFoods(pool)` exists so the Library page can
show the count above the custom-foods list. Silently dropping a food the user
saved would leave them searching for it, not finding it, and never learning why.

---

## 8. D8 — `useCollection<T, TNew>` extracted

`useCustomMeals` and `useCustomFoods` were not similar, they were the same
function with a different fetcher: same four-states union, same alive ref, same
sequence-number guard, same write-then-refetch. Two copies of an
out-of-order-response guard means a fix to one silently never reaches the other.

The Phase 3 §8 contracts are unchanged and now enforced in one tested place.

**What did NOT fold in:** `useWeights` (carries filter state) and `useDay`
(date-parameterised, computes `sort_order`). Both do more than hold a table, and
forcing them in would make the generic about nothing.

---

## 9. D14 — overwrite is ONE upsert, never save-then-delete

`saveCustomMeal` upserts on `name`, so saving under an existing name UPDATES that
row and returns the same id. The old app does `S.custom = S.custom.filter(...)`
then push (1069–1080) — a delete followed by an insert. Reproducing that against
the cloud would delete the row this just wrote, and the meal would be gone.

The same single-upsert property is what makes **Undo on a delete** work: undo
re-saves under the same name and the row comes back rather than a rival appearing
beside it.

### 9a. Found at build time — the overwrite warning and the upsert must agree

The old app's duplicate check is **case-insensitive** (`m.name.toLowerCase() ===
name.toLowerCase()`, 1067) but the upsert targets `name` **exactly**. So typing
"my bowl" against a stored "My Bowl" warns about an overwrite and then quietly
inserts a SECOND row.

**Ruling: when a case-insensitive clash is found, save under the EXISTING row's
exact name.** One line at the call site; the warning and the write now mean the
same thing. The same rule is applied in the Add Custom Food form.

The cost is that the typed casing is discarded on an overwrite. That is the right
trade: the user asked to replace a meal, and replacing it is what happens.

### 9b. The upsert-on-`name` branch is still unverified against real data

PHASE-2-DECISIONS §9 records that all 11 existing `custom_foods` rows carry a
barcode, so the name branch has never run; §8 records the backing unique
constraint as observed but unconfirmed. Phase 5's manual entry always takes that
branch (§1). If the index is absent, Postgres raises 42P10 and the save returns
`{ok: false, error: {kind: "conflict"}}` carrying the real message — which the
form surfaces verbatim, with a line telling the owner to check the constraint.

**Owner action: verify the unique index on `custom_foods` in the Supabase
dashboard before trusting the first custom-food save.**

---

## 10. R7 — `sumIngredients` widened to `Macros[]`, and NO `builderTotals`

The old app's `mbTotals` (949), `qlTotals` (2213) and `sumIngs` (642) are the same
accumulator character for character: same `{0,0,0,0}` seed, same 1 dp fed
forward, same refusal to round `kcal` per step.

`sumIngredients` already implemented it and only ever read the four macro fields,
so widening its parameter from `ScaledIngredient[]` to `Macros[]` lets both
composers reuse the oracle-tested original. Runtime behaviour is unchanged and
every existing caller still type-checks.

**Do NOT write a `builderTotals`.** A second function with identical arithmetic is
precisely how `dayTotals` and `sumIngredients` would have drifted apart if
PHASE-4-DECISIONS §7a had not caught them.

---

## 11. THE DROPDOWN RULE — this is the phase it lands in

From the Project Instructions, and the most important rule in the project. Phase 4
§4 deferred search specifically so that this phase would be where it first gets
exercised. `components/library/food-search.tsx` is the only hand-rendered
dropdown in the app, and `tests/components/food-search.test.tsx` pins every clause
of the rule:

1. **`onMouseDown` + `preventDefault()`, never `onClick` alone.** Blur fires
   before click. With `onClick`, the input blurs, the list unmounts, and the tap
   lands on nothing — "the dropdown doesn't work sometimes", which is very hard to
   find. `preventDefault()` in mousedown stops the blur entirely. Old app 1042.
2. **Click-outside-to-close**, on `pointerdown` — a `click` listener would fire
   after the same blur had already closed things.
3. **Enter = select first, Escape = close.** Old app 1102–1103.

**`onClick` IS also present on each option**, and that is not a violation: the
rule forbids `onClick` INSTEAD OF `onMouseDown`. Options are real `<button>`s so
that a keyboard or screen-reader user can reach them, and that path fires click
with no preceding mousedown. A `selecting` ref guards the pair so one tap adds one
food, never two — tested.

**Deliberately NOT added: arrow-key roving highlight.** The rule says "Enter =
select first". A highlight would make Enter mean something that depends on
invisible state.

**Native `<select>` for category and measurement type.** The rule governs anything
we hand-render; the platform's own picker is better on a phone and cannot get
blur-before-click wrong.

---

## 12. `confirm()` and `alert()` are replaced by inline state, not by modals

The old app has five blocking dialogs in this phase's code: zero-quantity rows
(1066), overwrite a meal (1068), "enter a meal name" (1063), "add at least one
ingredient" (1064), and delete a custom food (1827).

Phase 3 §6 ruled that DELETE gets an Undo toast, never a confirm — a modal on a
phone taxes every action to guard against a rare mistake. The same reasoning
extends to the rest:

| Old dialog | Now |
|---|---|
| zero-quantity rows | amber line naming them; button reads "Save anyway" and takes two presses |
| overwrite a meal / food | amber line naming what will be replaced; button reads "Overwrite" |
| no name / no ingredients | disabled button with the reason under it |
| delete a custom meal | one tap + Undo toast (re-saves; §9) |
| delete a custom food | one tap + Undo toast |

**Found at build time:** the first draft of the zero-quantity guard hid its own
warning once acknowledged, so the first press looked like it had done nothing.
The warning now stays up whenever a row is at 0 and only its wording changes;
editing any quantity re-arms the guard.

---

## 13. Quirks carried forward, each deliberately

These are the old app's behaviours that a clean rewrite would "fix" into a
disagreement with the stored rows. Every one is pinned by test.

- **`qty: ing.qty + "g"` regardless of unit** (`mbSave`, 1077). One scoop of whey
  is stored as `"1g"`. It is a wrong LABEL, never a wrong number: the macros
  stored beside it are the macros for that quantity, so `baseQty` reads back 1 and
  the gram editor scales from 1. Every `custom_meals` row in the live database was
  written this way, and those rows are the oracle (Plan §6).
- **`defaultQty || 100` on a new composer row but `|| 5` on a top-up** (982/981).
  A food with no default starts at 100 and grows by 5.
- **`defaultQty || (isGramUnit ? 100 : 1)` in the log editor's Add Item** (3445) —
  a THIRD fallback, different from the composer's. Two call sites, two rules, both
  the old app's. Unifying them would change a starting quantity that has been the
  same for every meal ever logged from that widget.
- **`parseFloat(v); isNaN||v<0 ? 0 : v`** on every composer quantity (960). An
  empty box reads as ZERO, not as "unchanged", so the totals visibly fall and you
  can see what you are about to save.
- **`note: notes || name`** (1073).
- **Quick Log's auto-name** (2281–2283): one ingredient in full with its unit,
  `"Banana (1piece)"`; several abbreviated to first word plus quantity,
  `"Rolled 80g, Clover 250ml"`. The abbreviation is what makes a multi-item entry
  fit one line of the day list.
- **The off-plan warning stays up** once raised (975–979). It is about the meal
  being built, not about the tap.

---

## 14. SA comma decimals — three halves, all required

`parseFloat("10,6")` stops at the comma and returns 10. On a protein box that is
a silently wrong macro of exactly the class the correctness oracle exists to
catch.

The old app's fix has three parts and dropping any one re-introduces the bug
(1742–1753):

1. the macro inputs are `type="text"` (`inputMode="decimal"`), so the SA keypad's
   comma reaches the handler at all;
2. `CF_NUM_RE = /^-?\d*[.,]?\d+$/` rejects junk like `"12abc"` or `"1.2.3"` that
   `parseFloat` would silently coerce;
3. comma → period before parsing.

All three are ported. Tested.

---

## 15. `useComposer` — one composer, three call sites

The old app writes the composer three times: `mbAddIng`/`mbRemoveIng`/`mbTotals`
(974–989), `qlAddIng`/`qlRemoveIng`/`qlTotals` (2197–2233), and
`logAddFood`/`logRemoveIng` (3442–3478). The three had already drifted — only the
builder shows the flagged-food warning, and only it uses `unitStep`.

One hook, three call sites. It computes nothing itself: row macros come from
`macrosForQuantity` and the total from `sumIngredients`.

**Found at build time — `add` does not report added-vs-topped-up.** The first
draft returned `"added" | "topped-up" | "unusable"`, assigning the value inside
the `setRows` updater. That value is stale by construction: React may run the
updater later or more than once, and its return value cannot escape. A test caught
it returning `"added"` for a top-up. `add` now returns a plain `boolean` —
usable or refused — which is decidable synchronously from the argument alone. No
caller needed the distinction.

---

## 16. Logging from the Library navigates to Nutrition

`qaddL` (3588) sets the date to today, logs, and switches view. Kept: seeing the
meal land in the day is a stronger confirmation than a toast, and it is where you
were going next anyway.

**Errors do NOT navigate.** A failed log stays on the Library page with the toast,
where the tap happened.

The Library page calls `useDay(todayIso())` purely so `sort_order` is computed by
the hook that holds the day's list — PHASE-2-DECISIONS §5's rule that
`sort_order` is a required caller parameter, never derived elsewhere.

---

## 17. The library gram editor never writes back to `custom_meals`

Editing grams on a saved meal changes what gets LOGGED, not what is saved. That is
`logCustomG`'s behaviour (685) and `resetGCustom` (667) confirms it by throwing
the overrides away. To change a saved definition you rebuild it in the builder.

---

## 18. Test infrastructure — two things that bite

- **The Vitest glob had to include `.tsx`.** `tests/**/*.test.ts` does NOT match
  `.test.tsx`: the file is silently never collected and `npm test` still reports
  green, which is worse than having no test at all. Fixed in `vitest.config.mts`
  and pinned by `tests/vitest-config.test.ts`, which globs with the runner's own
  patterns and asserts the canary comes back.
- **`afterEach(cleanup)` is REQUIRED in every `.test.tsx` that renders.**
  `@testing-library/react` auto-registers cleanup only when the runner exposes
  global hooks, and this repo runs without `globals: true`. Without it every
  `render` stacks another copy in the same document and `getByRole` starts failing
  with "found multiple elements" in whichever test happens to run second.
- **`@testing-library/jest-dom` is NOT installed.** Assert on the DOM directly —
  `el.textContent`, `el.value`, `el.disabled`. Adding the package is a separate
  call.

---

## 19. Four states on this surface

| Surface | Empty | Loading | Error | Happy |
|---|---|---|---|---|
| Library — saved meals | "No saved meals yet", pointing at the builder | three `--bg3` skeletons | keeps last good rows under a visible banner + Try again | grouped by category, gram editor, log-to-today |
| Library — custom foods | "None yet", explaining they join the built-in 74 | two `--bg3` skeletons | says saves will still be written; Try again | list with per-basis macros and delete |
| Meal builder | "Search and add ingredients above" | — (no read of its own) | inline line; **form contents kept** | live rows and totals |
| Add Custom Food | — (a form is never empty-state) | — | inline line naming the field or the conflict | saves, clears, toast |
| Quick Log | rows hidden until the first food is added | — | toast; **rows kept** | total + auto-name preview |

Two rules run through all of it: **a failed READ keeps the last good rows under a
visible error**, and **a failed WRITE never clears the user's work**. Retyping
four ingredients to retry a network blip is how people stop logging altogether.

`STATUS.md`'s Library row stays unticked until the owner verifies all four on the
real phone. Claude Code cannot reach the device.

---

## 20. What Phase 6 inherits

- The barcode field, `cfLookup`, Open Food Facts, and the camera viewfinder go
  back onto the Add Custom Food form (§1).
- `cfServing` — the per-serving view and its two save branches (1777–1798) —
  arrives with it.
- `findCustomFoodByBarcode` (2100) and the upsert-on-`barcode` branch become live
  again, which is when §9b's constraint question is answered for both branches.

---

## 21. Post-merge review findings (2026-08-06)

**`/review` ran AFTER the merge, not before it.** PR #2 and PR #3 landed Phase 5
on `main` (`301b527`) while the pre-landing gate in `CLAUDE.md` ("`/review`
before every commit") had not been run, and before the `STATUS.md` phone
verification. The findings below were therefore fixed forward on
`phase-5-review-fixes` rather than caught at the gate. Recorded because the
ordering is the lesson, not just the bugs.

### 21a. P1 — a deleted Add Item row handed its quantity to the row below

`components/nutrition/meal-editor.tsx`, `MacroEditor`. Removing an added row
filtered `added` but not `qty`, which is POSITIONAL and paired with `added` by
index inside `scaleIngredients`. Every row below the deleted one shifted up into
someone else's quantity override.

Reproduction: add Rolled Oats, add Banana, set the oats to 200g, delete the oats.
The banana lands at index 0, inherits `qty[0] = 200`, and renders — and SAVES —
as 200 bananas, 17 800 kcal. Nothing on screen suggests a problem.

This is the exact failure class Plan §6's oracle exists to catch: a wrong number
written to `meal_logs` with a plausible-looking screen above it.

`IngredientEditor` never had the bug. It marks removals in a `Set<number>` over a
stable array, so indices never move — which is why the same feature is correct in
one branch and wrong in the other, and why the fix is to filter `qty` alongside
`added` rather than to unify the two editors.

**The file had ZERO test coverage.** `tests/components/meal-editor.test.tsx` is
new, and the regression test was verified to fail against the unfixed code
(`expected '200' to be '1'`) before being accepted.

### 21b. React key collided for a custom food sharing a built-in's name

`components/library/food-search.tsx` keyed options on `` `${name}-${unit}` ``.
D6 (§6) exists precisely because a custom food may carry a built-in's name, and
it will usually carry the same unit too. Duplicate keys are a warning at best and
the WRONG food selected after a re-render at worst. Now `foodIdentity(food)` —
the function D6 already provides.

### 21c. The mousedown/click guard could stick

The `selecting` boolean was set on mousedown and cleared only inside `onClick`. A
mousedown that never produces a click — drag the finger off the option, or an
OS-cancelled touch — left it stuck `true`, and the next click-only selection
(keyboard Enter, or a screen reader's synthetic click) was silently swallowed.
Replaced with a timestamp, which ages out on its own.

### 21d. A failed custom-foods read was silent on Nutrition

The Library page says so; the Nutrition page did not, so Quick Log and Add Item
would quietly show the built-in 74 only. Same reasoning as D7's unusable-foods
count: a user searching for a food they saved must be able to learn why it is not
there. One line above Quick Log covers both search boxes, because both read the
page's single pool (D4).

### 21e. A negative default quantity was accepted

`NUM_RE` allows a leading `-` and the negative check covered only the four
macros, so `defaultQty: -100` could be saved. `defaultQty || 100` treats it as a
perfectly good number, so every composer row for that food would start negative.
The old app has the same hole (1776/1799 parse with no range check); it is closed
here because nothing legitimate is lost.

### 21f. STILL OPEN — the overwrite warning depends on a successful read

`components/library/meal-builder.tsx` derives `clash` from `library.meals`. If
that read failed, no overwrite warning appears — but `saveCustomMeal` still
upserts on `name` and replaces the stored row. A saved meal definition can be
replaced without notice during an error state.

The write itself stays correct; only the warning is missing. Options are to warn
that duplicates could not be checked, to block saving until the library reads, or
to leave it. **Not yet decided by the owner.** Recommendation on record: add the
warning line — blocking punishes the user for a transient network blip.
