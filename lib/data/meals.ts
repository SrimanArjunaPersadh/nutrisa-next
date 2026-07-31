/**
 * `meal_logs` — read + write. Ported from `syncFromCloud`'s meal branch (1868,
 * 1890–1906), `cloudAddMeal` (2019), `cloudDelMeal` (2035), and the three update
 * sites at 3374, 3395 and 3556.
 */

import { getSupabase, run } from "./client";
import { isoDay, loggedMealToInsert, rowToLoggedMeal } from "./mappers";
import type { LoggedMeal, MealRow, Result, StoredIngredient } from "./types";

/**
 * Both readers order by `date`, then `sort_order`, then `id`.
 *
 * The old app uses only the first two (1868); `id` is a THIRD key added here.
 * `sort_order` is not unique — the real data contains `[2,2,3,4,5,6]`,
 * `[3,3,3,4,8]` and `[3,3,4,4]`, because a delete never renumbers and the next
 * insert reuses a length. With two keys those ties are resolved at Postgres's
 * discretion, so the same day could render in a different order in the two apps
 * during cutover and read as a bug. The third key changes no stored value.
 * See PHASE-2-DECISIONS §4.
 */

/** Meals logged on a date, in the old app's display order. */
export async function fetchMealsForDate(
  date: string,
): Promise<Result<LoggedMeal[]>> {
  return run(
    () =>
      getSupabase()
        .from("meal_logs")
        .select("*")
        .eq("date", date)
        .order("date", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true })
        .returns<MealRow[]>(),
    (rows) => rows.map(rowToLoggedMeal),
  );
}

/**
 * Every meal ever logged, grouped `{ 'YYYY-MM-DD': LoggedMeal[] }`.
 *
 * Present because copy-yesterday and the dashboard roll-up need more than one
 * day. Prefer `fetchMealsForDate` where one day will do — this grows without
 * bound (Plan §5.2's phone-at-the-gym reality).
 */
export async function fetchAllMeals(): Promise<
  Result<Record<string, LoggedMeal[]>>
> {
  return run(
    () =>
      getSupabase()
        .from("meal_logs")
        .select("*")
        .order("date", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true })
        .returns<MealRow[]>(),
    (rows) => {
      const byDate: Record<string, LoggedMeal[]> = {};
      for (const row of rows) {
        const meal = rowToLoggedMeal(row);
        (byDate[isoDay(row.date)] ??= []).push(meal);
      }
      return byDate;
    },
  );
}

/**
 * Log a meal. Old app `cloudAddMeal` (2019–2033).
 *
 * `sortOrder` is REQUIRED and is 1-BASED. Callers pass `dayList.length + 1`, where
 * `dayList` is the day's currently fetched meals: the old app pushes onto its local
 * array and then reads that array's length, so the first meal of a day is stored as
 * 1, not 0. Deriving it here would cost a second round trip and could disagree with
 * what the user is looking at. See PHASE-2-DECISIONS §5.
 */
export async function addMeal(
  date: string,
  meal: Omit<LoggedMeal, "_id" | "sortOrder">,
  sortOrder: number,
): Promise<Result<LoggedMeal>> {
  return run(
    () =>
      getSupabase()
        .from("meal_logs")
        .insert(loggedMealToInsert(date, meal, sortOrder))
        .select()
        .single<MealRow>(),
    rowToLoggedMeal,
  );
}

/**
 * Update a logged meal's macros, and optionally its ingredient list.
 *
 * One function covers all three of the old app's update sites, which differ only
 * in whether they touch `ings_json`:
 *   • 3374 — macros + ings (the gram editor recalculating a meal)
 *   • 3395 — macros only (`updateLoggedMacros`, direct macro edit)
 *   • 3556 — macros, plus ings only when the editor produced new ones
 *
 * Passing `ings` as `undefined` leaves the stored column untouched, which is what
 * "macros only" means. Passing `null` deliberately CLEARS it.
 */
export async function updateMeal(
  id: string,
  macros: Pick<LoggedMeal, "kcal" | "pro" | "carb" | "fat">,
  ings?: readonly StoredIngredient[] | null,
): Promise<Result<LoggedMeal>> {
  const patch: Record<string, unknown> = {
    kcal: macros.kcal,
    pro: macros.pro,
    carb: macros.carb,
    fat: macros.fat,
  };
  if (ings !== undefined) {
    patch.ings_json = ings === null ? null : JSON.stringify(ings);
  }

  return run(
    () =>
      getSupabase()
        .from("meal_logs")
        .update(patch)
        .eq("id", id)
        .select()
        .single<MealRow>(),
    rowToLoggedMeal,
  );
}

/**
 * Delete a logged meal. Old app `cloudDelMeal` (2035–2042).
 *
 * A missing id is a SUCCESS, not a failure — the old app returns `true` (2036) and
 * it is right to: deleting nothing changed nothing, and surfacing an error state
 * for a no-op would be a lie to the user. See PHASE-2-DECISIONS §8.
 */
export async function deleteMeal(id: string | null | undefined): Promise<Result<null>> {
  if (!id) return { ok: true, data: null };

  return run(
    async () => {
      const { error } = await getSupabase().from("meal_logs").delete().eq("id", id);
      return { data: error ? null : ({} as Record<string, never>), error };
    },
    () => null,
  );
}
