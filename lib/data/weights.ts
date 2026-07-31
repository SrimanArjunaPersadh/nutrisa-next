/**
 * `weight_logs` — read + write. Ported from the old app's `syncFromCloud`
 * weight branch (1867, 1881–1884), `cloudLogW` (2000) and `cloudDelW` (2009).
 */

import { getSupabase, run } from "./client";
import { rowToWeightEntry } from "./mappers";
import type { Result, WeightEntry, WeightRow } from "./types";

/**
 * Every weigh-in, oldest first.
 *
 * Ordering matters: `trendWeight` steps once per ENTRY in series order, so the
 * ascending sort is part of the arithmetic, not presentation. (`lib/engine` sorts
 * defensively too — PHASE-1-DECISIONS §6 — but the query asks for the right order
 * rather than relying on that.)
 *
 * An empty table returns `[]`. The old app left its stale local array in place on
 * an empty result (1881); with no local store, empty means empty.
 */
export async function fetchWeights(): Promise<Result<WeightEntry[]>> {
  return run(
    () =>
      getSupabase()
        .from("weight_logs")
        .select("*")
        .order("date", { ascending: true })
        .returns<WeightRow[]>(),
    (rows) => rows.map(rowToWeightEntry),
  );
}

/**
 * Log or correct a weigh-in. Old app `cloudLogW` (2000–2007).
 *
 * Upserts on `date`, so re-weighing the same day REPLACES rather than duplicates —
 * that is what makes back-dated edits (Plan §5.3) work.
 */
export async function logWeight(
  date: string,
  weight: number,
): Promise<Result<WeightEntry>> {
  return run(
    () =>
      getSupabase()
        .from("weight_logs")
        .upsert({ date, weight }, { onConflict: "date" })
        .select()
        .single<WeightRow>(),
    rowToWeightEntry,
  );
}

/** Delete a weigh-in by date. Old app `cloudDelW` (2009–2016). */
export async function deleteWeight(date: string): Promise<Result<null>> {
  return run(
    async () => {
      const { error } = await getSupabase()
        .from("weight_logs")
        .delete()
        .eq("date", date);
      return { data: error ? null : ({} as Record<string, never>), error };
    },
    () => null,
  );
}
