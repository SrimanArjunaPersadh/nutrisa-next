"use client";

/**
 * `useWeights` — the Weight tab's read model (PHASE-3-DECISIONS §8).
 *
 * The first data-bound hook in the app, so it sets the pattern for Phases 4–8:
 * a client hook over `lib/data`, one explicit refetch after every successful
 * write, no fetching library, no optimistic layer, no Server Components.
 *
 * The reason to prefer this shape is `WeightsState`. Its four members ARE the
 * four-states rule (Plan §4.4), so a surface that forgets to render one is a
 * TypeScript error rather than a screen nobody ever sees. `STATUS.md` and this
 * union are the same list.
 *
 * Nothing here computes. Every displayed figure comes from `lib/engine` applied
 * to `weights` — this hook only fetches, orders and reports (Plan §6).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  deleteWeight,
  fetchWeights,
  logWeight,
  type DataError,
  type Result,
  type WeightEntry,
} from "@/lib/data";

/**
 * The four states, named exactly as Plan §4.4 names them.
 *
 * `empty` is distinct from `ready` with a zero-length list on purpose: an empty
 * weigh-in history is an invitation to act, not a chart with nothing in it
 * (PHASE-3-DECISIONS §10). The old app rendered `0.0 kg` here — a fabricated
 * reading — and we do not.
 */
export type WeightsState = "loading" | "error" | "empty" | "ready";

export type UseWeights = {
  /**
   * Every weigh-in, oldest first — `fetchWeights` asks the DB for that order and
   * the engine sorts defensively anyway.
   *
   * ALWAYS the FULL history, never a filtered slice. The Weight page's
   * Week/Month/All filter narrows what is DRAWN; it must never narrow what is
   * passed to `trendWeight`, `weeklyRateAt` or `targetLine`, because smoothing
   * needs all past data (PHASE-3-DECISIONS §2).
   *
   * Holds the last successful read across a failed refetch, so the page can show
   * a stale list under an error rather than blanking out.
   */
  readonly weights: readonly WeightEntry[];
  readonly state: WeightsState;
  /** Non-null exactly when `state` is `"error"`. Carries the real message. */
  readonly error: DataError | null;
  /** Re-read the table. Safe to call at any time; late responses are discarded. */
  readonly refetch: () => Promise<void>;
  /**
   * Log or correct a weigh-in, then refetch on success.
   *
   * Returns the write's own `Result` so the CALLER can surface the failure —
   * writes are reported at the point of action (the button, the toast), not by
   * flipping the whole list into its error state. A failed write leaves the list
   * exactly as it was, which is the truth: nothing changed.
   */
  readonly log: (date: string, weight: number) => Promise<Result<WeightEntry>>;
  /** Delete a weigh-in, then refetch on success. Same reporting contract as {@link log}. */
  readonly remove: (date: string) => Promise<Result<null>>;
};

/**
 * Read `weight_logs` and keep it fresh.
 *
 * The mutations live here rather than at the call site so that "write, then
 * refetch" cannot be half-remembered. A caller that reached for `logWeight`
 * directly would write successfully and then show a stale list — a silent
 * staleness bug with nothing to catch it.
 */
export function useWeights(): UseWeights {
  const [weights, setWeights] = useState<readonly WeightEntry[]>([]);
  const [state, setState] = useState<WeightsState>("loading");
  const [error, setError] = useState<DataError | null>(null);

  const alive = useRef(true);
  /** Sequence number of the most recently STARTED read. */
  const latest = useRef(0);

  // Declared before the fetching effect so it runs first on mount and last on
  // cleanup. React StrictMode mounts twice in development: without this, the
  // first mount's in-flight read resolves against an unmounted component.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refetch = useCallback(async () => {
    const id = ++latest.current;
    const result = await fetchWeights();

    // Drop a response that arrived after a newer read started, or after unmount.
    // Without the sequence check, a slow first request can overwrite a fast
    // second one and quietly restore pre-write data.
    if (!alive.current || id !== latest.current) return;

    if (!result.ok) {
      setError(result.error);
      setState("error");
      return;
    }

    setError(null);
    setWeights(result.data);
    setState(result.data.length === 0 ? "empty" : "ready");
  }, []);

  // The async wrapper is load-bearing, not ceremony: a bare `void refetch()` here
  // trips `react-hooks/set-state-in-effect`, because the rule cannot see that
  // every `setState` in `refetch` happens AFTER an await and so cannot cascade.
  // Awaiting inside the effect states that explicitly. Do not "simplify".
  useEffect(() => {
    void (async () => {
      await refetch();
    })();
  }, [refetch]);

  const log = useCallback(
    async (date: string, weight: number) => {
      const result = await logWeight(date, weight);
      if (result.ok) await refetch();
      return result;
    },
    [refetch],
  );

  const remove = useCallback(
    async (date: string) => {
      const result = await deleteWeight(date);
      if (result.ok) await refetch();
      return result;
    },
    [refetch],
  );

  return { weights, state, error, refetch, log, remove };
}
