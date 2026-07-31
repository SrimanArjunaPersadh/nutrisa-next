/**
 * The Supabase data layer (Plan §2, §8; built Phase 2).
 *
 * Five EXISTING tables, read and written with zero schema changes:
 * `weight_logs`, `meal_logs`, `custom_meals`, `water_logs`, `custom_foods`.
 *
 * Three rules this layer keeps:
 *   1. Nothing throws. Every call returns a `Result`; a failed write is visible
 *      (Plan §4.4), never silent, and never queued locally (Plan §0.3).
 *   2. Nothing here is stateful. No cache, no local store, no optimistic layer —
 *      those are the UI phases' business.
 *   3. The mapping is the risk. `mappers.ts` is separate and separately tested
 *      against real rows, because a wrong column name is wrong macros with no
 *      error anywhere (Plan §6).
 *
 * Rulings and the live schema survey: `docs/PHASE-2-DECISIONS.md`.
 */

export { getSupabase, SupabaseConfigError, classifyError } from "./client";

export type {
  CustomFood,
  CustomFoodRow,
  CustomMeal,
  CustomMealRow,
  DataError,
  ErrorKind,
  LoggedMeal,
  MealRow,
  Result,
  StoredIngredient,
  WaterRow,
  WeightEntry,
  WeightRow,
} from "./types";
export { err, ok } from "./types";

export {
  customFoodConflictTarget,
  customFoodToUpsert,
  customMealToUpsert,
  ingredientQty,
  isoDay,
  loggedMealToInsert,
  parseIngsJson,
  rowToCustomFood,
  rowToCustomMeal,
  rowToLoggedMeal,
  rowToWeightEntry,
} from "./mappers";

export { deleteWeight, fetchWeights, logWeight } from "./weights";
export { addMeal, deleteMeal, fetchAllMeals, fetchMealsForDate, updateMeal } from "./meals";
export { deleteCustomMeal, fetchCustomMeals, saveCustomMeal } from "./customMeals";
export {
  deleteCustomFood,
  fetchCustomFoods,
  findCustomFoodByBarcode,
  saveCustomFood,
} from "./customFoods";
export { fetchAllWater, fetchWaterForDate, setWater } from "./water";
