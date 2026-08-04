/**
 * The Saved Meals list's grouping. Ports `CATS` (447) and the grouping loop in
 * `vN()` (2800–2840).
 *
 * This is display structure, not arithmetic, so it lives here rather than in
 * `lib/engine` — no macro is touched by anything in this file.
 */

import type { CustomMeal } from "./data/types";

/** The old app's four meal categories, in its order. Line 447. */
export const CATS = ["Breakfast", "Lunch", "Supper", "Pre-Workout"] as const;

export type MealCategory = (typeof CATS)[number];

/**
 * Where meals land that carry no category, or one the app has never heard of.
 *
 * DIVERGENCE FROM THE OLD APP, deliberate (PHASE-4-DECISIONS §4a). `vN()` builds
 * the list as `CATS.map(cat => meals.filter(m => m.cat === cat))`, so a saved
 * meal whose `cat` is null, `""` or anything outside those four is silently
 * DROPPED — it exists in `custom_meals`, it is counted nowhere, and there is no
 * screen it can be reached from. `rowToCustomMeal` maps a null `cat` to `""`
 * (mappers.ts:166), so the DB can produce exactly that row.
 *
 * Nothing in the current fixture hits this — all four saved meals carry a real
 * category — which is precisely why it would go unnoticed until the day it did.
 * An unreachable row is worse than an ugly heading.
 */
export const UNCATEGORISED = "Uncategorised";

export type MealGroup = {
  readonly cat: string;
  readonly meals: readonly CustomMeal[];
};

/**
 * Group saved meals under {@link CATS}, in the old app's category order, with any
 * strays collected at the end.
 *
 * Empty categories are omitted, matching `vN()`'s `if (!meals.length) return ''`
 * (2802). A heading with nothing under it is noise on a phone.
 *
 * Within a category, the incoming order is preserved — `fetchCustomMeals` orders
 * by `created_at`, which is what the old app's `am()` returns (1869).
 */
export function groupByCategory(
  meals: readonly CustomMeal[],
): readonly MealGroup[] {
  const groups: MealGroup[] = [];

  for (const cat of CATS) {
    const inCat = meals.filter((m) => m.cat === cat);
    if (inCat.length > 0) groups.push({ cat, meals: inCat });
  }

  const known = new Set<string>(CATS);
  const strays = meals.filter((m) => !known.has(m.cat));
  if (strays.length > 0) groups.push({ cat: UNCATEGORISED, meals: strays });

  return groups;
}
