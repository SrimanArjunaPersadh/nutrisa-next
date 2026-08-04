"use client";

/**
 * `useCustomMeals()` — the saved-meal library, read-only in Phase 4.
 *
 * Separate from `useDay` on purpose: `custom_meals` does not change when the
 * date does, so folding it into the day hook would re-read the whole library
 * every time you stepped back a day.
 *
 * Same four-states union as every other hook (PHASE-3-DECISIONS §8). No writes
 * here in this phase — saving and deleting library meals is Phase 5 (Plan §5.4).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchCustomMeals, type CustomMeal, type DataError } from "@/lib/data";

export type CustomMealsState = "loading" | "error" | "empty" | "ready";

export type UseCustomMeals = {
  /** Every saved meal, oldest first (`created_at`), as the old app's `am()` returns. */
  readonly meals: readonly CustomMeal[];
  readonly state: CustomMealsState;
  readonly error: DataError | null;
  readonly refetch: () => Promise<void>;
};

export function useCustomMeals(): UseCustomMeals {
  const [meals, setMeals] = useState<readonly CustomMeal[]>([]);
  const [state, setState] = useState<CustomMealsState>("loading");
  const [error, setError] = useState<DataError | null>(null);

  const alive = useRef(true);
  const latest = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refetch = useCallback(async () => {
    const id = ++latest.current;
    const result = await fetchCustomMeals();

    if (!alive.current || id !== latest.current) return;

    if (!result.ok) {
      setError(result.error);
      setState("error");
      return;
    }

    setError(null);
    setMeals(result.data);
    setState(result.data.length === 0 ? "empty" : "ready");
  }, []);

  // The async wrapper is load-bearing — see the note in `useWeights`.
  useEffect(() => {
    void (async () => {
      await refetch();
    })();
  }, [refetch]);

  return { meals, state, error, refetch };
}
