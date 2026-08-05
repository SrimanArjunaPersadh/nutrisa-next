"use client";

/**
 * `useCollection<T, TNew>` — the read-model shape every whole-table surface
 * shares, extracted in Phase 5 (eng review D8).
 *
 * **Why this exists.** `useCustomMeals` and `useCustomFoods` are not similar,
 * they are the same function with a different fetcher: same four-states union,
 * same alive ref, same sequence-number guard, same write-then-refetch. Two
 * copies of an out-of-order-response guard means a fix to one silently never
 * reaches the other.
 *
 * **What did NOT fold in.** `useWeights` and `useDay` stay hand-written.
 * `useDay` is date-parameterised and computes `sort_order` from the day's list
 * length; `useWeights` carries filter state. Both do more than hold a table, and
 * forcing them in here would make this generic about nothing.
 *
 * The contracts are Phase 3 §8's, unchanged and now enforced in one place:
 *
 *   • **The four-states union IS the four-states rule** (Plan §4.4). Because
 *     `state` is `'loading' | 'error' | 'empty' | 'ready'`, a surface that fails
 *     to handle one is a TYPE ERROR, not a blank panel someone notices in
 *     production.
 *   • **A failed READ keeps the last good rows** under a visible error (§8a).
 *     Stale numbers that were true a moment ago, with an error saying so, beat
 *     blanking the screen.
 *   • **A failed WRITE never moves the list into its error state.** The button
 *     or toast at the call site reports it; the list keeps telling the truth.
 *     The write's own `Result` is returned unchanged for exactly that purpose.
 *   • **Out-of-order responses are discarded by sequence number.** A slow read
 *     landing after a newer one would quietly restore stale rows, and nothing
 *     would look wrong.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { DataError, Result } from "@/lib/data";

/** The four states, and there are only ever four. */
export type CollectionState = "loading" | "error" | "empty" | "ready";

/**
 * The three data-layer calls a collection is built from.
 *
 * Held in a ref internally, so callers may pass a fresh object literal every
 * render without retriggering the read — only the FUNCTIONS need to be stable,
 * and module-level imports always are.
 */
export type CollectionOps<T, TNew> = {
  readonly fetch: () => Promise<Result<T[]>>;
  readonly save: (item: TNew) => Promise<Result<T>>;
  readonly remove: (id: string | null | undefined) => Promise<Result<null>>;
};

export type Collection<T, TNew> = {
  readonly items: readonly T[];
  readonly state: CollectionState;
  readonly error: DataError | null;
  readonly refetch: () => Promise<void>;
  /** Returns the write's own `Result` — the caller surfaces failures. */
  readonly save: (item: TNew) => Promise<Result<T>>;
  /** Returns the write's own `Result` — the caller surfaces failures. */
  readonly remove: (id: string | null | undefined) => Promise<Result<null>>;
};

export function useCollection<T, TNew>(
  ops: CollectionOps<T, TNew>,
): Collection<T, TNew> {
  const [items, setItems] = useState<readonly T[]>([]);
  const [state, setState] = useState<CollectionState>("loading");
  const [error, setError] = useState<DataError | null>(null);

  const alive = useRef(true);
  const latest = useRef(0);

  /**
   * The ops, refreshed after every render but never a dependency.
   *
   * This is what keeps `refetch` stable with an empty dep array — the same
   * shape the hand-written hooks had. Depending on `ops` itself would re-create
   * `refetch` on every render (the object literal is new each time), which the
   * mount effect would then re-run: an infinite read loop.
   *
   * The refresh happens in an EFFECT, not during render. Mutating a ref while
   * rendering is what `react-hooks/refs` forbids, and it is genuinely unsafe
   * under concurrent rendering, where a render can be thrown away — the ref
   * would keep ops from a render that never committed. `useRef(ops)` seeds the
   * first value, this effect is declared before the mount read so the ref is
   * current by the time anything calls `fetch`, and every call afterwards
   * happens from a handler or an effect, i.e. after commit.
   */
  const opsRef = useRef(ops);
  useEffect(() => {
    opsRef.current = ops;
  });

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refetch = useCallback(async () => {
    const id = ++latest.current;
    const result = await opsRef.current.fetch();

    // Unmounted, or a newer read has already landed. Either way this answer is
    // no longer the truth and must not be written.
    if (!alive.current || id !== latest.current) return;

    if (!result.ok) {
      // Note what is NOT here: `setItems([])`. The rows on screen stay.
      setError(result.error);
      setState("error");
      return;
    }

    setError(null);
    setItems(result.data);
    setState(result.data.length === 0 ? "empty" : "ready");
  }, []);

  // The async wrapper is load-bearing — see the note in `useWeights`.
  useEffect(() => {
    void (async () => {
      await refetch();
    })();
  }, [refetch]);

  const save = useCallback(
    async (item: TNew): Promise<Result<T>> => {
      const result = await opsRef.current.save(item);
      // Only a write that actually changed something is worth re-reading for.
      if (result.ok) await refetch();
      return result;
    },
    [refetch],
  );

  const remove = useCallback(
    async (id: string | null | undefined): Promise<Result<null>> => {
      const result = await opsRef.current.remove(id);
      if (result.ok) await refetch();
      return result;
    },
    [refetch],
  );

  return { items, state, error, refetch, save, remove };
}
