/**
 * `custom_foods` — scanned and manually-added ingredients, in `FOOD_DB` shape.
 * Ported from `syncFromCloud`'s custom-food branch (1871, 1956–1979),
 * `cloudSaveCustomFood` (2108), `saveCustomFood` (2129), `cloudDelCustomFood`
 * (2155) and `findCustomFoodByBarcode` (2100).
 *
 * This is the table the Plan omitted until v1.3. It is where Plan §7's three-tier
 * add-food flow lands — barcode, OCR and manual all funnel into one row here.
 */

import { getSupabase, run } from "./client";
import { customFoodConflictTarget, customFoodToUpsert, rowToCustomFood } from "./mappers";
import type { CustomFood, CustomFoodRow, Result } from "./types";

/** Every custom food, oldest first — the old app's `.order('created_at')` (1871). */
export async function fetchCustomFoods(): Promise<Result<CustomFood[]>> {
  return run(
    () =>
      getSupabase()
        .from("custom_foods")
        .select("*")
        .order("created_at", { ascending: true })
        .returns<CustomFoodRow[]>(),
    (rows) => rows.map(rowToCustomFood),
  );
}

/**
 * Save a custom food. Old app `cloudSaveCustomFood` (2108–2124).
 *
 * The conflict target is `barcode` when the food has one, else `name` — so
 * re-scanning a product updates its row instead of duplicating it.
 *
 * If the unique constraint backing the chosen target does not exist, Postgres
 * raises `42P10` and this returns `kind: "conflict"` carrying the real message.
 * That classification is deliberate: those constraints cannot be verified from the
 * client (the OpenAPI route requires `service_role`, which we never use), so a
 * missing one has to become visible at runtime rather than silently mis-writing.
 * See PHASE-2-DECISIONS §6 and §12 finding 8.
 */
export async function saveCustomFood(
  food: Omit<CustomFood, "_id">,
): Promise<Result<CustomFood>> {
  return run(
    () =>
      getSupabase()
        .from("custom_foods")
        .upsert(customFoodToUpsert(food), {
          onConflict: customFoodConflictTarget(food),
        })
        .select()
        .single<CustomFoodRow>(),
    rowToCustomFood,
  );
}

/** Delete a custom food. Old app `cloudDelCustomFood` (2155–2162). */
export async function deleteCustomFood(
  id: string | null | undefined,
): Promise<Result<null>> {
  if (!id) return { ok: true, data: null };

  return run(
    async () => {
      const { error } = await getSupabase()
        .from("custom_foods")
        .delete()
        .eq("id", id);
      return { data: error ? null : ({} as Record<string, never>), error };
    },
    () => null,
  );
}

/**
 * Find an already-saved food by barcode, for instant pre-fill on a re-scan.
 *
 * PURE and local — no network, exactly like the old app's
 * `findCustomFoodByBarcode` (2100–2104), which searches the in-memory list. The
 * old app read its localStorage-backed `S.customFoods`; with no local store the
 * caller passes the list it already fetched. Same behaviour, no hidden state.
 *
 * Comparison is on the STRING form, trimmed — barcodes are digit strings that must
 * never be coerced to numbers (leading zeros, and lengths beyond 2^53).
 */
export function findCustomFoodByBarcode(
  foods: readonly CustomFood[],
  code: string | number | null | undefined,
): CustomFood | null {
  if (!code) return null;
  const wanted = String(code).trim();
  return (
    foods.find((f) => f.barcode && String(f.barcode) === wanted) ?? null
  );
}
