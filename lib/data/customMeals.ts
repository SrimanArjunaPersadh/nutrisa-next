/**
 * `custom_meals` — the saved library meals. Ported from `syncFromCloud`'s custom
 * branch (1869, 1934–1946), `cloudSaveCustomMeal` (2074) and
 * `cloudDelCustomMeal` (2087).
 */

import { getSupabase, run } from "./client";
import { customMealToUpsert, rowToCustomMeal } from "./mappers";
import type { CustomMeal, CustomMealRow, Result } from "./types";

/** Every saved meal, oldest first — the old app's `.order('created_at')` (1869). */
export async function fetchCustomMeals(): Promise<Result<CustomMeal[]>> {
  return run(
    () =>
      getSupabase()
        .from("custom_meals")
        .select("*")
        .order("created_at", { ascending: true })
        .returns<CustomMealRow[]>(),
    (rows) => rows.map(rowToCustomMeal),
  );
}

/**
 * Save a library meal. Old app `cloudSaveCustomMeal` (2074–2085).
 *
 * Upserts on `name`, so re-saving a meal under the same name UPDATES it. That is
 * why the old app can treat a name as a stable key (and why `meal_logs.lib_id`
 * stores a name rather than a UUID — 3564).
 */
export async function saveCustomMeal(
  meal: Omit<CustomMeal, "_id" | "id">,
): Promise<Result<CustomMeal>> {
  return run(
    () =>
      getSupabase()
        .from("custom_meals")
        .upsert(customMealToUpsert(meal), { onConflict: "name" })
        .select()
        .single<CustomMealRow>(),
    rowToCustomMeal,
  );
}

/** Delete a saved meal. Old app `cloudDelCustomMeal` (2087–2094). */
export async function deleteCustomMeal(
  id: string | null | undefined,
): Promise<Result<null>> {
  if (!id) return { ok: true, data: null };

  return run(
    async () => {
      const { error } = await getSupabase()
        .from("custom_meals")
        .delete()
        .eq("id", id);
      return { data: error ? null : ({} as Record<string, never>), error };
    },
    () => null,
  );
}
