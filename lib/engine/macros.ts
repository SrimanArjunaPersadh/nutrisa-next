/**
 * Macros for a quantity of a food — Migration Plan §6.
 *
 * Ported from the old app's `isGramUnit` / `foodMacros`
 * (`docs/reference/old-index.html` lines 900–919).
 */

import type { Food, Macros } from "./types";

/**
 * Does this food measure in grams/millilitres (per-100 basis) or in countable
 * units (per-unit basis)? This one predicate is the ONLY thing the arithmetic
 * cares about in a food's unit string.
 */
export function isGramUnit(food: Pick<Food, "unit">): boolean {
  return food.unit === "g" || food.unit === "ml";
}

/** Round to 1 dp exactly as the old app does (`+(n).toFixed(1)`). */
function round1(n: number): number {
  return +n.toFixed(1);
}

/**
 * `qty × perUnit`, respecting `unitType`.
 *
 *   • `g` / `ml` → `per100 × (qty / 100)`
 *   • anything else → `perUnit × qty`
 *
 * The rounding here is INSIDE the engine on purpose. It is not formatting: these
 * values are written to `meal_logs` and rolled up into day totals, so the rounded
 * figure is the stored figure. kcal goes to a whole number, macros to 1 dp —
 * the old app's exact treatment.
 *
 * @throws if the food lacks the basis its unit requires. The old app read
 * straight through (`food.per100.kcal` on an undefined `per100`) and crashed with
 * a TypeError; this throws the same failure with a message that says why.
 */
export function macrosForQuantity(food: Food, qty: number): Macros {
  if (isGramUnit(food)) {
    if (!food.per100) {
      throw new TypeError(
        `food with unit "${food.unit}" needs per100 macros, none present`,
      );
    }
    const r = qty / 100;
    return {
      kcal: Math.round(food.per100.kcal * r),
      pro: round1(food.per100.pro * r),
      carb: round1(food.per100.carb * r),
      fat: round1(food.per100.fat * r),
    };
  }

  if (!food.perUnit) {
    throw new TypeError(
      `food with unit "${food.unit}" needs perUnit macros, none present`,
    );
  }
  return {
    kcal: Math.round(food.perUnit.kcal * qty),
    pro: round1(food.perUnit.pro * qty),
    carb: round1(food.perUnit.carb * qty),
    fat: round1(food.perUnit.fat * qty),
  };
}
