/**
 * Unit display helpers — ported from the old app's `unitDisplayLabel` (911),
 * `unitStep` (919) and `unitMin` (924).
 *
 * **These are DISPLAY, not engine.** They compute no nutrition fact: a label, a
 * stepper increment and a floor for a number input. Same reasoning that kept
 * `pct()` in the component in Phase 4 §7 — the engine owns arithmetic whose
 * result gets stored or fed into more arithmetic, and none of this is that.
 *
 * They take a structural `{ unit }` rather than a named type so that
 * `SearchableFood`, `CustomFood` and a bare stored row all fit without importing
 * anything from here. Same shape as `isGramUnit`'s `Pick<Food, "unit">`.
 */

import { isGramUnit } from "./engine/macros";

/** The minimum a unit can hold: a `{ unit }` is all any of these need. */
type Unitish = { readonly unit: string };

/**
 * Plurals for the countable units. Old app 914.
 *
 * **Deliberately incomplete, and carried forward that way.** `sausage` and
 * `biscuit` are units in `FOOD_DB` and appear in NEITHER this map nor the
 * gram-unit branch, so they fall through to the bare unit and render as
 * "2 sausage". `tbsp` / `tsp` / `pinch` map to themselves on purpose — they do
 * not pluralise. Fixing the gaps would change rendered text the old app has
 * always shown; pinned by test so nobody "tidies" it without meaning to.
 */
const PLURALS: Readonly<Record<string, string>> = {
  slice: "slices",
  piece: "pieces",
  scoop: "scoops",
  steak: "steaks",
  spray: "sprays",
  tbsp: "tbsp",
  tsp: "tsp",
  pinch: "pinch",
};

/**
 * What to show next to a quantity input: `g` / `ml` for weight and volume,
 * otherwise the unit, pluralised when the quantity is not exactly 1.
 *
 * Note the comparison is `qty === 1`, so 0 and 1.5 both pluralise — "0 slices",
 * "1.5 slices". That is the old app's behaviour and it reads correctly.
 */
export function unitDisplayLabel(food: Unitish, qty: number): string {
  if (isGramUnit(food)) return food.unit;
  return qty === 1 ? food.unit : (PLURALS[food.unit] ?? food.unit);
}

/**
 * The `step` for a quantity input. Grams move in 5s, millilitres in 10s,
 * spoons in halves, and anything countable in whole units.
 *
 * This is why eng review D5 matters: the saved-meal editor hardcoded `step="5"`
 * regardless of unit, so a steak stepped 1 → 5 → 10. Anything rendering a
 * quantity input must ask this function, not assume grams.
 */
export function unitStep(food: Unitish): number {
  if (isGramUnit(food)) return food.unit === "ml" ? 10 : 5;
  if (food.unit === "tbsp" || food.unit === "tsp") return 0.5;
  return 1;
}

/**
 * The `min` for a quantity input. Always 0.
 *
 * The old app declares this as `unitMin(food)` and ignores the argument (924).
 * Ported without the parameter: a function that takes a food and never reads it
 * invites the belief that the floor is food-dependent, which it is not. The
 * VALUE is the port; the arity was never load-bearing.
 *
 * Zero, not one, is correct — the composer lets a row sit at 0 while you decide,
 * and `mbSave` warns about 0-quantity rows rather than preventing them.
 */
export function unitMin(): number {
  return 0;
}
