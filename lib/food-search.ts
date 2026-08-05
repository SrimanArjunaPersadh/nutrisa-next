/**
 * Food search — ported from the old app's `searchFoodDB` (938–945).
 *
 * Pure and synchronous. The pool is handed in rather than reached for: the PAGE
 * owns `useCustomFoods()` and passes it down (eng review D4), so three mounted
 * search boxes read one fetch instead of three.
 *
 * **Name-only, deliberately.** `searchFoodDB` never looks at `cat`, and Plan
 * §5.4's "search across names + ingredients" describes the MEAL search
 * (`doSearch`, 748), not this one.
 */

import { isGramUnit } from "./engine/macros";
import { FOOD_DB, type SearchableFood } from "./food-db";

/** The old app's cap: 8 results, no more (945). */
export const SEARCH_LIMIT = 8;

/**
 * The searchable pool: built-ins first, then the user's custom foods.
 * Old app 943 — `[...FOOD_DB, ...(S.customFoods || [])]`.
 *
 * **The order is load-bearing.** Results are capped at 8, so on a crowded query
 * this decides which foods a user can actually reach. Built-ins first is the old
 * app's choice and it is kept.
 */
export function foodPool(
  customFoods: readonly SearchableFood[] = [],
): readonly SearchableFood[] {
  return [...FOOD_DB, ...customFoods];
}

/**
 * Can this food's macros actually be computed?
 *
 * A `g`/`ml` food is read through `per100` and everything else through
 * `perUnit` (`macrosForQuantity`). A row carrying neither — or carrying the
 * wrong one for its unit — makes that function THROW, and with no error
 * boundary that used to mean a dead screen on the installed PWA.
 *
 * `custom_foods` can produce exactly such a row: `rowToCustomFood`
 * (`lib/data/mappers.ts:215`) attaches a basis only when the column is non-null.
 * Eng review D7 guards the read side here; the Add Custom Food form's gram-unit
 * guard (old app 1765) guards the write side.
 */
export function isUsableFood(food: SearchableFood): boolean {
  return isGramUnit(food) ? Boolean(food.per100) : Boolean(food.perUnit);
}

/**
 * The foods in a pool that cannot be used, so a surface can SAY so.
 *
 * Silently dropping a food the user saved is its own bug — they would search for
 * it, not find it, and have no way to learn why. Compute this once per pool (not
 * per keystroke) and show the count somewhere honest.
 */
export function unusableFoods(
  pool: readonly SearchableFood[],
): readonly SearchableFood[] {
  return pool.filter((food) => !isUsableFood(food));
}

/**
 * Foods whose name contains `query`, case-insensitively, capped at 8.
 *
 * Ports `searchFoodDB` exactly, plus the D7 usability filter:
 *   • empty or whitespace-only query → no results (the old app's
 *     `q.trim().length < 1` guard, so the dropdown starts closed)
 *   • substring match on `name`, lower-cased both sides
 *   • unusable foods removed BEFORE the cap, so a broken row cannot consume one
 *     of the 8 slots a good one needed
 *   • first 8 in pool order
 */
export function searchFoods(
  query: string,
  pool: readonly SearchableFood[],
  limit: number = SEARCH_LIMIT,
): readonly SearchableFood[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 1) return [];

  const matches: SearchableFood[] = [];
  for (const food of pool) {
    if (matches.length >= limit) break;
    if (!isUsableFood(food)) continue;
    if (food.name.toLowerCase().includes(needle)) matches.push(food);
  }
  return matches;
}

/**
 * The identity two pool entries are considered "the same food" by.
 *
 * **Not the name (eng review D6).** The old app tops up an existing composer row
 * when `i.f.name === food.name` (975–977) while the pool is
 * `[...FOOD_DB, ...customFoods]` with no dedupe — so a custom food you named
 * "Banana" and the built-in Banana collapse into ONE row that keeps whichever
 * arrived first and silently uses its macros for both. Wrong numbers, no
 * warning, and the correctness oracle cannot catch it because both apps agree.
 *
 * A `custom_foods` row has `_id`; a built-in never does. Keying on the id when
 * there is one keeps them distinct, and two built-ins can still never collide
 * because `FOOD_DB` has no duplicate names (pinned in `tests/food-db.test.ts`).
 */
export function foodIdentity(food: SearchableFood & { _id?: string }): string {
  return food._id ? `id:${food._id}` : `name:${food.name}`;
}

/** Do these two pool entries refer to the same food? */
export function isSameFood(
  a: SearchableFood & { _id?: string },
  b: SearchableFood & { _id?: string },
): boolean {
  return foodIdentity(a) === foodIdentity(b);
}
