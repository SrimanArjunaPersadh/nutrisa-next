/**
 * Row ↔ object mapping — the crown jewel of Phase 2.
 *
 * Every function here is a pure translation of the old app's mapping code in
 * `docs/reference/old-index.html`, line numbers cited per function. A wrong
 * mapping produces wrong macros with no error anywhere, so this file is kept
 * separate from the query code specifically so it can be tested on its own
 * against real rows.
 *
 * WHAT IS NOT HERE, deliberately: the old app's localStorage merge layer
 * (1907–1928, 1947–1953, 1970–1978) — unsynced-entry preservation, `_ings`/`_libId`
 * patching, lowercase-name dedupe. Plan §0.3 cut the local store, so there is
 * nothing to merge against. Cloud rows are the only source. See
 * `docs/PHASE-2-DECISIONS.md` §2.
 */

import type {
  CustomFood,
  CustomFoodRow,
  CustomMeal,
  CustomMealRow,
  LoggedMeal,
  MealRow,
  Numeric,
  StoredIngredient,
  WeightEntry,
  WeightRow,
} from "./types";
import { isGramUnit } from "../engine/macros";

/* ── shared coercions ─────────────────────────────────────────────────────── */

/** `parseFloat` on whatever the column gave us. The old app's defence, kept. */
const num = (v: Numeric): number => (typeof v === "number" ? v : parseFloat(v));

/**
 * Round to 1 dp with `+parseFloat(x).toFixed(1)` — the old app's exact idiom
 * (1901–1903). NOT `Math.round(x*10)/10`: the two disagree on exact-half decimal
 * representations, and `toFixed` produced every stored value. Same lesson as
 * PHASE-1-DECISIONS §1.
 */
const round1 = (v: Numeric): number => +num(v).toFixed(1);

/**
 * Take the calendar-day prefix.
 *
 * CONFIRMED 2026-07-31: every `date` column in this project returns a bare
 * `YYYY-MM-DD`, so this is currently a no-op — the old app's comment at 1882
 * claiming Supabase sends `'YYYY-MM-DDT00:00:00'` is wrong. Kept anyway, because
 * a column type we do not control could start sending a timestamp and a weigh-in
 * is a calendar day either way. Mirrors `msFromIsoDate` in `lib/engine/trend.ts`.
 */
export const isoDay = (date: string): string => date.slice(0, 10);

/**
 * The numeric value of a stored ingredient `qty`.
 *
 * The two tables disagree: `meal_logs.ings_json` stores `"80"`, `custom_meals
 * .ingredients` stores `"80g"` (§12 finding 5). The old app survives this only
 * because `parseFloat("80g") === 80`. This is the ONE place that coercion lives.
 *
 * Returns `0` for an unparseable qty, matching the old app's `parseFloat(x)||0`.
 */
export const ingredientQty = (qty: string): number => parseFloat(qty) || 0;

/* ── weight_logs ──────────────────────────────────────────────────────────── */

/**
 * `weight_logs` row → engine `WeightEntry`. Old app line 1883.
 *
 * The old app renames `weight` to `w` for its local store; we keep `weight`
 * because that is what `lib/engine`'s `WeightEntry` already calls it. No rounding:
 * the weight is stored as authored and `trendWeight` does its own 2 dp work.
 */
export function rowToWeightEntry(row: WeightRow): WeightEntry {
  return { date: isoDay(row.date), weight: num(row.weight) };
}

/* ── meal_logs ────────────────────────────────────────────────────────────── */

/**
 * Parse `ings_json`. Old app line 1898.
 *
 * Unparseable JSON yields `null`, exactly as the old app's inline try/catch does —
 * a corrupt ingredient list must not take down the whole day's fetch.
 */
export function parseIngsJson(
  raw: string | null,
): readonly StoredIngredient[] | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredIngredient[];
  } catch {
    return null;
  }
}

/**
 * `meal_logs` row → `LoggedMeal`. Old app lines 1895–1905.
 *
 * THE ROUNDING IS LOAD-BEARING. `Math.round(kcal)` and 1 dp on the macros are the
 * old app's, and they happen on READ. These values roll up into day totals, so by
 * PHASE-1-DECISIONS §3 they are engine-side, not display. On today's data the
 * rounding changes nothing (§12 finding 2) — it is kept because it is the old
 * app's behaviour and because the column types are not ours to guarantee.
 *
 * `sortOrder` is carried through: the app needs it to compute the NEXT one.
 */
export function rowToLoggedMeal(row: MealRow): LoggedMeal {
  return {
    _id: row.id,
    _libId: row.lib_id ?? null,
    _ings: parseIngsJson(row.ings_json),
    name: row.name,
    kcal: Math.round(num(row.kcal)),
    pro: round1(row.pro),
    carb: round1(row.carb),
    fat: round1(row.fat),
    time: row.logged_time ?? "",
    sortOrder: row.sort_order,
  };
}

/**
 * `LoggedMeal` → an insertable `meal_logs` row. Old app lines 2023–2029.
 *
 * `sortOrder` is a REQUIRED argument, never derived here. It is 1-BASED: the old
 * app pushes the meal onto its local array and THEN reads that array's length
 * (all five call sites — 696→700, 802→805, 2062→2065, 2299→2304, 3578→3581), so
 * the first meal of a day is stored as 1. Callers pass `dayList.length + 1`.
 * See PHASE-2-DECISIONS §5.
 */
export function loggedMealToInsert(
  date: string,
  meal: Omit<LoggedMeal, "_id" | "sortOrder">,
  sortOrder: number,
) {
  return {
    date,
    name: meal.name,
    kcal: meal.kcal,
    pro: meal.pro,
    carb: meal.carb,
    fat: meal.fat,
    logged_time: meal.time,
    sort_order: sortOrder,
    lib_id: meal._libId || null,
    ings_json: meal._ings ? JSON.stringify(meal._ings) : null,
  };
}

/* ── custom_meals ─────────────────────────────────────────────────────────── */

/**
 * `custom_meals` row → `CustomMeal`. Old app lines 1935–1946.
 *
 * `ingredients` is jsonb and arrives parsed — no `JSON.parse` here, unlike
 * `meal_logs`. `id` is exposed twice (as `_id` and `id`) because the old app does
 * so at 1936–1937 for its `(c.id || c.name)` lookups.
 */
export function rowToCustomMeal(row: CustomMealRow): CustomMeal {
  return {
    _id: row.id,
    id: row.id,
    name: row.name,
    cat: row.cat ?? "",
    note: row.note ?? "",
    kcal: Math.round(num(row.kcal)),
    pro: round1(row.pro),
    carb: round1(row.carb),
    fat: round1(row.fat),
    ingredients: row.ingredients ?? [],
  };
}

/** `CustomMeal` → an upsertable `custom_meals` row. Old app lines 2077–2081. */
export function customMealToUpsert(meal: Omit<CustomMeal, "_id" | "id">) {
  return {
    name: meal.name,
    cat: meal.cat,
    note: meal.note || "",
    kcal: meal.kcal,
    pro: meal.pro,
    carb: meal.carb,
    fat: meal.fat,
    ingredients: meal.ingredients || [],
  };
}

/* ── custom_foods ─────────────────────────────────────────────────────────── */

/**
 * `custom_foods` row → `CustomFood`. Old app lines 1959–1969.
 *
 * The three renames all live here: `per_unit`→`perUnit`, `default_qty`→
 * `defaultQty`, `unit_label`→`unitLabel`.
 *
 * `per100` / `perUnit` / `unitLabel` are OMITTED rather than set to `null` when
 * absent — the old app spreads them conditionally (`...(r.per100 ? {...} : {})`),
 * and the engine's `Food` distinguishes "absent" from "present but empty" when it
 * decides which basis to use.
 *
 * The `defaultQty` fallback reads the unit the same way `isGramUnit` does: 100 for
 * a per-100 food, 1 for a countable one (1964).
 */
export function rowToCustomFood(row: CustomFoodRow): CustomFood {
  const unit = row.unit ?? "g";
  return {
    _id: row.id,
    name: row.name,
    cat: row.cat ?? "Other",
    unit,
    defaultQty:
      row.default_qty != null ? num(row.default_qty) : isGramUnit({ unit }) ? 100 : 1,
    ...(row.per100 ? { per100: row.per100 } : {}),
    ...(row.per_unit ? { perUnit: row.per_unit } : {}),
    ...(row.unit_label ? { unitLabel: row.unit_label } : {}),
    barcode: row.barcode || null,
  };
}

/**
 * `CustomFood` → an upsertable `custom_foods` row. Old app lines 2111–2118.
 *
 * Note the asymmetry with the read mapper: absent bases are written as explicit
 * `null` here (`food.per100 || null`) but omitted on the way in. That is the old
 * app's behaviour in both directions and it matters — writing `undefined` would
 * leave a stale value in place on an upsert.
 */
export function customFoodToUpsert(food: Omit<CustomFood, "_id">) {
  const unit = food.unit || "g";
  return {
    name: food.name,
    cat: food.cat || "Other",
    unit,
    default_qty:
      food.defaultQty != null ? food.defaultQty : isGramUnit({ unit }) ? 100 : 1,
    per100: food.per100 || null,
    per_unit: food.perUnit || null,
    unit_label: food.unitLabel || null,
    barcode: food.barcode || null,
  };
}

/**
 * Which column an upsert of this food conflicts on. Old app line 2119.
 *
 * `barcode` when the food has one, else `name`. Re-scanning a product must UPDATE
 * its row rather than duplicate it, which is the whole reason for the branch.
 *
 * Caveat recorded in PHASE-2-DECISIONS §12 finding 9: all 11 stored rows carry a
 * barcode, so the `name` branch has never run against real data.
 */
export function customFoodConflictTarget(
  food: Pick<CustomFood, "barcode">,
): "barcode" | "name" {
  return food.barcode ? "barcode" : "name";
}
