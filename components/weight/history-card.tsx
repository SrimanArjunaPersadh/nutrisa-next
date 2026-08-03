"use client";

/**
 * The history list. Ports 3082–3103.
 *
 * Newest first, each row carrying the raw weight, the delta against the previous
 * WEIGH-IN (not the previous calendar day — gaps are not filled), and the trend
 * value for that date looked up in the FULL trend line. That lookup is the whole
 * point: a filtered view still shows trend values that carry every earlier
 * weigh-in (PHASE-3-DECISIONS §2).
 */

import { Trash2 } from "lucide-react";

import { formatDayCompact } from "@/lib/date";
import type { TrendPoint, WeightEntry } from "@/lib/engine/types";

export type HistoryCardProps = {
  /** The FILTERED slice — what the period currently shows. */
  entries: readonly WeightEntry[];
  /** The FULL trend line, for per-row lookup. */
  trend: readonly TrendPoint[];
  onDelete: (entry: WeightEntry) => void;
  /** Date currently being deleted, so its row can show it. */
  deleting: string | null;
};

export function HistoryCard({
  entries,
  trend,
  onDelete,
  deleting,
}: HistoryCardProps) {
  // Newest first for reading; the delta compares against the entry BELOW it,
  // which is the chronologically previous one.
  const rows = [...entries].reverse();
  const trendFor = (date: string) => trend.find((p) => p.date === date);

  return (
    <section className="rounded-card border border-border bg-bg2 p-4">
      <h2 className="text-card font-semibold text-text">
        History —{" "}
        <span data-numeric>
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </span>
      </h2>

      {rows.length === 0 ? (
        <p className="mt-3 text-body text-text-3">
          No weigh-ins in this period. Try a wider range.
        </p>
      ) : (
        <ul className="mt-2 max-h-[32rem] overflow-y-auto">
          {rows.map((entry, i) => {
            const previous = rows[i + 1];
            const delta = previous ? entry.weight - previous.weight : null;
            const point = trendFor(entry.date);
            const busy = deleting === entry.date;

            return (
              <li
                key={entry.date}
                className="flex items-center justify-between gap-2 border-b border-border py-2 last:border-b-0"
              >
                <div>
                  <div className="text-body text-text" data-numeric>
                    {formatDayCompact(entry.date)}
                  </div>
                  {point && (
                    <div className="text-label text-text-3" data-numeric>
                      trend {point.tw.toFixed(1)} kg
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {delta !== null && delta !== 0 && (
                    <span
                      className={`text-label ${delta < 0 ? "text-green" : "text-red"}`}
                      data-numeric
                    >
                      {delta < 0 ? "▼" : "▲"}
                      {Math.abs(delta).toFixed(1)}
                    </span>
                  )}
                  <span
                    className="font-display text-card text-text"
                    data-numeric
                  >
                    {entry.weight.toFixed(1)} kg
                  </span>
                  <button
                    type="button"
                    onClick={() => onDelete(entry)}
                    disabled={busy}
                    aria-label={`Delete weigh-in for ${formatDayCompact(entry.date)}`}
                    className="grid size-11 shrink-0 place-items-center rounded-btn text-text-3 transition-colors hover:text-red disabled:opacity-40"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
