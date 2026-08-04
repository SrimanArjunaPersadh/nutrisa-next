"use client";

/**
 * `useDay(date)` — the Nutrition tab's read model (PHASE-4-DECISIONS §8).
 *
 * Follows `useWeights` exactly (PHASE-3-DECISIONS §8/§8a): a client hook over
 * `lib/data`, the four-states union as its `state`, the writes owned here so
 * "write, then refetch" cannot be half-remembered, and the same two contracts —
 *
 *   • A failed WRITE never moves the list into its error state. `error`/`state`
 *     describe the DAY's read; a write that failed changed nothing, so the list
 *     keeps saying what it said. The caller surfaces the returned `Result` at the
 *     point of action.
 *   • Out-of-order responses are discarded by sequence number.
 *
 * One difference from `useWeights`: this hook is PARAMETERISED by date, so the
 * date is a dependency of the read. Switching days re-reads, and a response for
 * yesterday that lands after you have moved to today is dropped by the same
 * sequence check that drops a stale refetch.
 *
 * Nothing here computes. Totals come from `lib/engine/day` applied to `meals`.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  addMeal,
  deleteMeal,
  fetchMealsForDate,
  type DataError,
  type LoggedMeal,
  type Result,
} from "@/lib/data";
import { nowHM, previousDay } from "@/lib/date";

/** The four states, named exactly as Plan §4.4 names them. */
export type DayState = "loading" | "error" | "empty" | "ready";

/** A meal ready to be written — everything but the fields the DB assigns. */
export type NewMeal = Omit<LoggedMeal, "_id" | "sortOrder">;

/** What `copyYesterday` did. The page turns this into a toast (§6). */
export type CopyResult =
  /** Yesterday had nothing to copy. Not an error — just nothing to do. */
  | { readonly kind: "nothing-to-copy" }
  /** Every meal copied. `ids` are the new rows, so Undo can remove exactly them. */
  | { readonly kind: "copied"; readonly ids: readonly string[]; readonly from: string }
  /**
   * Some copied, then a write failed. `ids` are the ones that DID land — the day
   * is genuinely half-copied, and saying so is the honest report (§4.4).
   */
  | {
      readonly kind: "partial";
      readonly ids: readonly string[];
      readonly from: string;
      readonly error: DataError;
    };

export type UseDay = {
  /** The day's meals in `sort_order` then `id` order — what `fetchMealsForDate` returns. */
  readonly meals: readonly LoggedMeal[];
  readonly state: DayState;
  /** Non-null exactly when `state` is `"error"`. Carries the real message. */
  readonly error: DataError | null;
  readonly refetch: () => Promise<void>;
  /**
   * Log a meal onto this day, then refetch on success.
   *
   * `sort_order` is supplied here as `meals.length + 1` — 1-BASED, per
   * PHASE-2-DECISIONS §5. This hook holds the day's list, so this hook is the
   * caller that knows its length. Nothing else should be computing it.
   */
  readonly log: (meal: NewMeal) => Promise<Result<LoggedMeal>>;
  /** Delete a logged meal, then refetch. Same reporting contract as {@link log}. */
  readonly remove: (id: string | undefined) => Promise<Result<null>>;
  /** Copy every meal from the previous day onto this one (§6). */
  readonly copyYesterday: () => Promise<CopyResult>;
};

export function useDay(date: string): UseDay {
  const [meals, setMeals] = useState<readonly LoggedMeal[]>([]);
  const [state, setState] = useState<DayState>("loading");
  const [error, setError] = useState<DataError | null>(null);

  const alive = useRef(true);
  /** Sequence number of the most recently STARTED read. */
  const latest = useRef(0);
  /**
   * The day's list, readable synchronously by the write helpers.
   *
   * `log` needs `meals.length` to compute `sort_order`, and reading the state
   * variable would capture whatever it was when the callback was created. Two
   * taps in quick succession would then both compute the same sort_order.
   */
  const current = useRef<readonly LoggedMeal[]>([]);

  // Declared before the fetching effect so it runs first on mount and last on
  // cleanup — same StrictMode reasoning as `useWeights`.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refetch = useCallback(async () => {
    const id = ++latest.current;
    const result = await fetchMealsForDate(date);

    if (!alive.current || id !== latest.current) return;

    if (!result.ok) {
      setError(result.error);
      setState("error");
      return;
    }

    setError(null);
    current.current = result.data;
    setMeals(result.data);
    setState(result.data.length === 0 ? "empty" : "ready");
  }, [date]);

  // The async wrapper is load-bearing — see the note in `useWeights`.
  // `refetch` changes identity when `date` does, so this re-reads on day change.
  useEffect(() => {
    void (async () => {
      await refetch();
    })();
  }, [refetch]);

  const log = useCallback(
    async (meal: NewMeal) => {
      const result = await addMeal(date, meal, current.current.length + 1);
      if (result.ok) await refetch();
      return result;
    },
    [date, refetch],
  );

  const remove = useCallback(
    async (id: string | undefined) => {
      const result = await deleteMeal(id);
      if (result.ok) await refetch();
      return result;
    },
    [refetch],
  );

  const copyYesterday = useCallback(async (): Promise<CopyResult> => {
    const from = previousDay(date);

    // One day-read, not `fetchAllMeals()` — Phase 2's own note warns that one
    // grows without bound, and we need exactly one extra day.
    const source = await fetchMealsForDate(from);
    if (!source.ok) {
      return { kind: "partial", ids: [], from, error: source.error };
    }
    if (source.data.length === 0) return { kind: "nothing-to-copy" };

    const ids: string[] = [];
    let sortOrder = current.current.length;

    for (const meal of source.data) {
      const result = await addMeal(
        date,
        {
          name: meal.name,
          kcal: meal.kcal,
          pro: meal.pro,
          carb: meal.carb,
          fat: meal.fat,
          // Stamped fresh, not carried from the source row (old app 2060). The
          // copy happened now, and the old app is right about that.
          time: nowHM(),
          _libId: meal._libId,
          _ings: meal._ings,
        },
        ++sortOrder,
      );

      if (!result.ok) {
        await refetch();
        return { kind: "partial", ids, from, error: result.error };
      }
      if (result.data._id) ids.push(result.data._id);
    }

    await refetch();
    return { kind: "copied", ids, from };
  }, [date, refetch]);

  return { meals, state, error, refetch, log, remove, copyYesterday };
}
