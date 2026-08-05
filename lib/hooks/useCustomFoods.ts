"use client";

/**
 * `useCustomFoods()` — the user's own ingredients (`custom_foods`).
 *
 * New in Phase 5. The table has been readable and writable in `lib/data` since
 * Phase 2 and no surface has ever touched it; the Add Custom Food form (R1) is
 * its first caller, and the three food searches are its first readers.
 *
 * **The PAGE owns this hook and passes the pool down (eng review D4).**
 * `FoodSearch` takes `pool` as a prop rather than calling this itself. Three
 * search boxes can be mounted on the Nutrition page at once — Quick Log plus one
 * Add Item per expanded logged meal — and a hook per mount would mean three
 * reads of the same table, three loading states, and three copies of the truth
 * that drift apart. Same pattern already running at
 * `app/(tabs)/nutrition/page.tsx:41`, where the page owns `useCustomMeals()` and
 * hands `library={library.meals}` to `LoggedList`.
 *
 * Shares its whole body with `useCustomMeals` via `useCollection` (D8).
 *
 * NOTE: this returns every custom food, including any that are unusable —
 * a row whose macro basis does not match its unit. Filtering belongs at the
 * search boundary (`isUsableFood` / `unusableFoods` in `lib/food-search.ts`, eng
 * review D7), not here: a surface that manages foods needs to SEE a broken one
 * in order to let you delete it.
 */

import { useMemo } from "react";

import {
  deleteCustomFood,
  fetchCustomFoods,
  saveCustomFood,
  type CustomFood,
  type DataError,
  type Result,
} from "@/lib/data";
import { useCollection, type CollectionState } from "./useCollection";

/** The four states. */
export type CustomFoodsState = CollectionState;

/** A food on its way in: the DB assigns `_id`. */
export type NewCustomFood = Omit<CustomFood, "_id">;

export type UseCustomFoods = {
  /** Every custom food, oldest first (`created_at`) — the old app's sync order. */
  readonly foods: readonly CustomFood[];
  readonly state: CustomFoodsState;
  readonly error: DataError | null;
  readonly refetch: () => Promise<void>;
  /**
   * Save a food. UPSERTS on `barcode` when the food has one, else on `name`
   * (`lib/data/mappers.ts` `customFoodConflictTarget`), so re-scanning a product
   * updates its row instead of duplicating it.
   *
   * **Phase 5 manual entry always takes the `name` branch**, because R1 strips
   * the barcode field. PHASE-2-DECISIONS §9 records that branch as never having
   * run against real data — all 11 existing rows carry a barcode — and §8
   * records the backing constraint as observed but unconfirmed. If the unique
   * index is absent, Postgres raises 42P10 and this returns
   * `{ ok: false, error: { kind: "conflict" } }` carrying the real message.
   * Verify the constraint in the Supabase dashboard before trusting saves.
   */
  readonly save: (food: NewCustomFood) => Promise<Result<CustomFood>>;
  readonly remove: (id: string | null | undefined) => Promise<Result<null>>;
};

export function useCustomFoods(): UseCustomFoods {
  const { items, state, error, refetch, save, remove } = useCollection<
    CustomFood,
    NewCustomFood
  >({
    fetch: fetchCustomFoods,
    save: saveCustomFood,
    remove: deleteCustomFood,
  });

  return useMemo(
    () => ({ foods: items, state, error, refetch, save, remove }),
    [items, state, error, refetch, save, remove],
  );
}
