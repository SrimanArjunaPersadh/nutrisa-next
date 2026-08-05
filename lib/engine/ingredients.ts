/**
 * The gram editor's arithmetic — Plan §6. Ports `baseG` (625), `calcIng` (627)
 * and `sumIngs` (642) from `docs/reference/old-index.html`.
 *
 * THE KEY INSIGHT, and the reason this could be pulled into Phase 4 without
 * dragging the food database with it: a stored ingredient already carries its
 * OWN macros for its OWN quantity. Re-portioning is therefore pure proportion —
 * `newMacros = stored × (newQty / storedQty)` — and never needs to look up a
 * per-100g basis, a `unitType`, or `FOOD_DB`. `macrosForQuantity` is the other
 * path, for a food being logged fresh; that one is Phase 5's business.
 *
 * Everything here reproduces the old app's rounding exactly, quirks included.
 * These figures are written back to `meal_logs`, so they are stored values, and
 * the old app's stored values are the oracle (§6).
 */

import type { Macros } from "./types";
import type { StoredIngredient } from "../data/types";

/**
 * An ingredient scaled to a quantity, ready to render or store.
 *
 * `qty` is a NUMBER here, unlike {@link StoredIngredient} whose `qty` is a
 * string. This is the calculated shape; the stored shape stays as it is on disk.
 */
export type ScaledIngredient = Macros & {
  readonly name: string;
  readonly qty: number;
};

/**
 * The quantity an ingredient's stored macros describe. Old app `baseG` (625).
 *
 * `parseFloat` takes the leading number, so `"133g"` → `133` and `"80"` → `80` —
 * which is what lets one function read both of the app's two qty conventions
 * (`custom_meals` stores `"80g"`, `meal_logs` stores `"80"`;
 * PHASE-2-DECISIONS §12 finding 5).
 *
 * THE `|| 100` FALLBACK IS THE OLD APP'S and is carried forward deliberately.
 * An unparseable or zero quantity becomes 100, not 0 — which is a guess, but it
 * is the guess every stored row was written against. Note it also swallows a
 * genuine `"0"`, turning it into 100.
 */
export function baseQty(ing: Pick<StoredIngredient, "qty">): number {
  return parseFloat(ing.qty) || 100;
}

/**
 * One ingredient at a new quantity. Old app `calcIng`'s body (627–640).
 *
 * Rounding is per-ingredient and matches the old app exactly: `Math.round` on
 * kcal, `+toFixed(1)` on the three macros. A zero or negative base quantity
 * yields a ratio of 0 rather than Infinity — the old app's `bg > 0 ? cg/bg : 0`.
 */
export function scaleIngredient(
  ing: StoredIngredient,
  qty: number,
): ScaledIngredient {
  const base = baseQty(ing);
  const ratio = base > 0 ? qty / base : 0;

  return {
    name: ing.name,
    qty,
    kcal: Math.round(ing.kcal * ratio),
    pro: +(ing.pro * ratio).toFixed(1),
    carb: +(ing.carb * ratio).toFixed(1),
    fat: +(ing.fat * ratio).toFixed(1),
  };
}

/**
 * Scale a whole list. `quantities[i]` overrides ingredient `i`'s stored quantity;
 * `undefined` leaves it at its stored value.
 *
 * That sparse-override shape is the old app's `S.gO` ("gram overrides") keyed by
 * `editorId_index` (622), expressed as data rather than as a global.
 */
export function scaleIngredients(
  ings: readonly StoredIngredient[],
  quantities: readonly (number | undefined)[] = [],
): ScaledIngredient[] {
  return ings.map((ing, i) =>
    scaleIngredient(ing, quantities[i] ?? baseQty(ing)),
  );
}

/**
 * Total a scaled list. Old app `sumIngs` (642–649).
 *
 * THE ROUNDING HERE IS A RUNNING ONE AND THAT IS NOT A MISTAKE. The old app
 * rounds the accumulator to 1 dp at EVERY step and feeds the rounded value
 * forward — `+(a.pro + x.pro).toFixed(1)` — exactly like `trendWeight` does at
 * 2 dp. That is a different algorithm from summing and rounding once, and it can
 * differ in the last decimal on a long ingredient list.
 *
 * `kcal` is NOT rounded per step, because `scaleIngredient` already made every
 * kcal an integer. Summing integers needs no help.
 *
 * Frozen. `dayTotals` rounds ONCE at the end and this rounds at every step; both
 * are correct, because both are what the old app wrote and both produced stored
 * values. Do not unify them.
 */
export function sumIngredients(ings: readonly ScaledIngredient[]): Macros {
  return ings.reduce<Macros>(
    (a, x) => ({
      kcal: a.kcal + x.kcal,
      pro: +(a.pro + x.pro).toFixed(1),
      carb: +(a.carb + x.carb).toFixed(1),
      fat: +(a.fat + x.fat).toFixed(1),
    }),
    { kcal: 0, pro: 0, carb: 0, fat: 0 },
  );
}

/**
 * A scaled list back in storable form, ready for `ings_json`. Old app
 * `updateLoggedEntry` (3360–3365).
 *
 * The edited quantities become the new BASELINE: each row is stored with its
 * current quantity and the macros for that quantity, so re-opening the editor
 * shows ratio 1 everywhere and a second edit scales from where the first left
 * off. `qty` goes back to a bare number string, `meal_logs`' convention.
 */
export function toStoredIngredients(
  ings: readonly ScaledIngredient[],
): StoredIngredient[] {
  return ings.map((ing) => ({
    name: ing.name,
    qty: String(ing.qty),
    kcal: ing.kcal,
    pro: ing.pro,
    carb: ing.carb,
    fat: ing.fat,
  }));
}
