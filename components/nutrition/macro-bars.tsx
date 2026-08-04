/**
 * The four progress bars. Ports `mac()` (2730–2747).
 *
 * These show CONSUMED against the ceiling — unchanged from the old app. The
 * tiles above them were flipped to remaining (PHASE-4-DECISIONS §2); the bars
 * are where the consumed figure still lives, which is what makes that flip safe.
 *
 * Macro colours are RESERVED (§4): protein, carbs and fats each own theirs and
 * are never used for anything else. Calories is the neutral row and takes its
 * colour from status, like the tiles.
 */

import {
  CARB_MAX,
  CARB_MIN,
  FAT_MAX,
  FAT_MIN,
  KCAL_MAX,
  KCAL_MIN,
  PRO_MAX,
  PRO_MIN,
  macroStatus,
  type MacroStatus,
} from "@/lib/engine/day";
import type { Macros } from "@/lib/engine/types";

/** Bar width. Geometry, not nutrition — `pct()` (518) stayed in the view (§7). */
function pct(value: number, max: number): number {
  return Math.min(100, Math.round((value / max) * 100));
}

/** Old `bc()` mapped status straight to a colour; the engine now returns status. */
const STATUS_FILL: Record<MacroStatus, string> = {
  over: "bg-red",
  "in-range": "bg-green",
  under: "bg-blue",
};

type Row = {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  /** The reserved macro colour, or undefined for the calories row. */
  fill?: string;
  text?: string;
};

export function MacroBars({ totals }: { totals: Macros }) {
  const rows: Row[] = [
    {
      label: "Calories",
      value: totals.kcal,
      min: KCAL_MIN,
      max: KCAL_MAX,
      unit: " kcal",
      text: "text-text-2",
    },
    {
      label: "Protein",
      value: totals.pro,
      min: PRO_MIN,
      max: PRO_MAX,
      unit: "g",
      fill: "bg-protein",
      text: "text-protein",
    },
    {
      label: "Carbs",
      value: totals.carb,
      min: CARB_MIN,
      max: CARB_MAX,
      unit: "g",
      fill: "bg-carbs",
      text: "text-carbs",
    },
    {
      label: "Fat",
      value: totals.fat,
      min: FAT_MIN,
      max: FAT_MAX,
      unit: "g",
      fill: "bg-fats",
      text: "text-fats",
    },
  ];

  return (
    <section className="rounded-card border border-border bg-bg2 p-4">
      <h2 className="sr-only">Progress against today&rsquo;s targets</h2>
      <div className="grid gap-3">
        {rows.map((row) => {
          const status = macroStatus(row.value, row.min, row.max);
          // Over the ceiling always reads red, even on a macro row that owns a
          // colour — going over is the louder fact (§1.5). Old app: same (2745).
          const fill =
            status === "over" ? STATUS_FILL.over : (row.fill ?? STATUS_FILL[status]);

          return (
            <div key={row.label}>
              <div className="flex items-baseline justify-between">
                <span className={`text-label font-medium ${row.text}`}>
                  {row.label}
                </span>
                <span className="text-label text-text-3" data-numeric>
                  <b className="font-semibold text-text-2">
                    {row.value}
                    {row.unit}
                  </b>{" "}
                  / {row.max}
                  {row.unit}
                </span>
              </div>
              <div
                className="mt-1 h-1.5 overflow-hidden rounded-btn bg-bg3"
                role="progressbar"
                aria-valuenow={row.value}
                aria-valuemin={0}
                aria-valuemax={row.max}
                aria-label={`${row.label}: ${row.value}${row.unit} of ${row.max}${row.unit}`}
              >
                <div
                  className={`h-full rounded-btn transition-[width] duration-300 ${fill}`}
                  style={{ width: `${pct(row.value, row.max)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
