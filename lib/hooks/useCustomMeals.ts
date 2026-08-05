"use client";

/**
 * `useCustomMeals()` — the saved-meal library.
 *
 * Separate from `useDay` on purpose: `custom_meals` does not change when the
 * date does, so folding it into the day hook would re-read the whole library
 * every time you stepped back a day.
 *
 * **Phase 5 (eng review D8): the body moved to `useCollection<T, TNew>`.** This
 * hook and `useCustomFoods` were the same function with a different fetcher, so
 * the sequence guard and the four-states transitions now live in one tested
 * place. The PUBLIC SHAPE below is unchanged from Phase 4 — `meals`, `state`,
 * `error`, `refetch` — which is why `tests/hooks/useCustomMeals.test.ts` (written
 * against the pre-refactor implementation) still passes and is what proves the
 * move was behaviour-preserving.
 *
 * **Phase 5 also adds the writes.** `custom_meals` has been readable since Phase
 * 2 and writable in `lib/data` since Phase 2, but nothing has ever saved to it —
 * the meal builder is the first caller.
 *
 * `meals` rather than `items`: the old app calls this list `am()` and every
 * surface reads it as meals. The rename is one line and it keeps the call sites
 * honest.
 */

import { useMemo } from "react";

import {
  deleteCustomMeal,
  fetchCustomMeals,
  saveCustomMeal,
  type CustomMeal,
  type DataError,
  type Result,
} from "@/lib/data";
import { useCollection, type CollectionState } from "./useCollection";

/** The four states. Aliased so existing call sites keep their vocabulary. */
export type CustomMealsState = CollectionState;

/** A meal on its way in: the DB assigns `_id`, and `id` mirrors it on read. */
export type NewCustomMeal = Omit<CustomMeal, "_id" | "id">;

export type UseCustomMeals = {
  /** Every saved meal, oldest first (`created_at`), as the old app's `am()` returns. */
  readonly meals: readonly CustomMeal[];
  readonly state: CustomMealsState;
  readonly error: DataError | null;
  readonly refetch: () => Promise<void>;
  /**
   * Save a meal. UPSERTS on `name` (`lib/data/customMeals.ts:38`), so saving
   * under an existing name UPDATES that row and returns the same `id`.
   *
   * **That is why overwrite is ONE call and must never be followed by a delete**
   * (eng review D14). Deleting "the old row" afterwards removes the row this
   * just wrote, and the meal is gone.
   */
  readonly save: (meal: NewCustomMeal) => Promise<Result<CustomMeal>>;
  readonly remove: (id: string | null | undefined) => Promise<Result<null>>;
};

export function useCustomMeals(): UseCustomMeals {
  const { items, state, error, refetch, save, remove } = useCollection<
    CustomMeal,
    NewCustomMeal
  >({
    fetch: fetchCustomMeals,
    save: saveCustomMeal,
    remove: deleteCustomMeal,
  });

  return useMemo(
    () => ({ meals: items, state, error, refetch, save, remove }),
    [items, state, error, refetch, save, remove],
  );
}
