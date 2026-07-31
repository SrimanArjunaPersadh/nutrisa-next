/**
 * `water_logs` — read + write. Ported from `syncFromCloud`'s water branch
 * (1870, 1982–1987) and `cloudSetWater` (2165).
 */

import { getSupabase, run } from "./client";
import { isoDay } from "./mappers";
import type { Result, WaterRow } from "./types";

/**
 * Cups drunk on a date. `0` when no row exists — the absence of a row means no
 * water logged, which is a real answer, not a missing one.
 *
 * Takes the LAST row, not the first, if a date somehow has more than one. That
 * matches the old app, whose `forEach` assignment into a keyed object leaves the
 * last row winning (1984), and it matches `fetchAllWater` below. `water_logs`
 * should have one row per date, but that uniqueness is observed on a single
 * stored row and is NOT schema-verified (PHASE-2-DECISIONS §12 finding 8), so the
 * two readers must at least agree with each other and with the old app.
 */
export async function fetchWaterForDate(date: string): Promise<Result<number>> {
  return run(
    () =>
      getSupabase()
        .from("water_logs")
        .select("*")
        .eq("date", date)
        .returns<WaterRow[]>(),
    (rows) => (rows.length > 0 ? rows[rows.length - 1].cups : 0),
  );
}

/** Every water row as a `{ 'YYYY-MM-DD': cups }` map. Old app lines 1982–1987. */
export async function fetchAllWater(): Promise<Result<Record<string, number>>> {
  return run(
    () => getSupabase().from("water_logs").select("*").returns<WaterRow[]>(),
    (rows) => {
      const water: Record<string, number> = {};
      for (const row of rows) water[isoDay(row.date)] = row.cups;
      return water;
    },
  );
}

/**
 * Set the cup count for a date. Old app `cloudSetWater` (2165–2169).
 *
 * DELIBERATE DIVERGENCE — the only one in Phase 2's control flow. The old app
 * returns nothing here and merely `console.error`s a failure (2168), making a lost
 * water write invisible. Plan §4.4 forbids a silent failure, so this returns the
 * same `Result` as every other write. A successful write is byte-identical; only
 * the reporting changed. See PHASE-2-DECISIONS §8.
 */
export async function setWater(
  date: string,
  cups: number,
): Promise<Result<number>> {
  return run(
    () =>
      getSupabase()
        .from("water_logs")
        .upsert({ date, cups }, { onConflict: "date" })
        .select()
        .single<WaterRow>(),
    (row) => row.cups,
  );
}
