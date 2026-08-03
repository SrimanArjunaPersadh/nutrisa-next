/**
 * The Weight page's Week / Month / All / Custom filter. Ports `fW()` (565–598).
 *
 * This narrows what is DRAWN and what the period tiles describe. It must never
 * narrow what reaches `trendWeight` / `weeklyRateAt` / `targetLine` — smoothing
 * needs all past data (PHASE-3-DECISIONS §2). The page passes the FULL series to
 * the engine and this slice to the renderer.
 *
 * Everything here compares `YYYY-MM-DD` STRINGS. Lexical order is chronological
 * order for that format, so day-granularity comparison needs no `Date` at all —
 * which removes the timezone trap the old app carried (see WEEK below).
 */

import { toIsoDay, todayIso } from "./date";
import type { WeightEntry } from "./engine/types";

export type WeightFilter =
  | { readonly kind: "week" }
  /** `ym` is `YYYY-MM`. */
  | { readonly kind: "month"; readonly ym: string }
  | { readonly kind: "all" }
  /** Either bound may be `""` — an unset bound does not constrain that end. */
  | { readonly kind: "custom"; readonly from: string; readonly to: string };

export const DEFAULT_FILTER: WeightFilter = { kind: "all" };

/** `YYYY-MM` for a day. */
export const monthOf = (iso: string): string => iso.slice(0, 7);

/** Shift a `YYYY-MM` by whole months. Old app `calMonthOffset` (2865–2869). */
export function offsetMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** First and last day of a `YYYY-MM`, inclusive. */
export function monthBounds(ym: string): { first: string; last: string } {
  const [y, m] = ym.split("-").map(Number);
  return {
    first: `${ym}-01`,
    // Day 0 of the NEXT month is the last day of this one.
    last: toIsoDay(new Date(y, m, 0)),
  };
}

/**
 * The first day the "Week" filter includes: today and the six days before it.
 *
 * DIVERGENCE FROM THE OLD APP, deliberate. `fW()` did
 * `d.setDate(d.getDate()-7)` and compared that against `new Date(x.date)` — a
 * LOCAL timestamp carrying the current time-of-day, against a UTC-midnight parse.
 * At SAST the day exactly 7 back is included only when the page is opened before
 * 02:00, so the same data yields a different window depending on the hour. That
 * is not a rule anyone can verify.
 *
 * Seven calendar days ending today, always. No stored number changes — this
 * decides which rows are DRAWN, not what any of them mean.
 */
export function weekStart(today: string): string {
  const d = new Date(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)) - 1,
    Number(today.slice(8, 10)) - 6,
  );
  return toIsoDay(d);
}

/**
 * Apply a filter to the full series, preserving order.
 *
 * `today` is injected rather than read from the clock so the Week window is
 * testable — the same reason `eta` takes it (PHASE-1-DECISIONS).
 */
export function filterWeights(
  series: readonly WeightEntry[],
  filter: WeightFilter,
  today: string = todayIso(),
): WeightEntry[] {
  switch (filter.kind) {
    case "all":
      return [...series];

    case "week": {
      const start = weekStart(today);
      return series.filter((e) => e.date >= start);
    }

    case "month": {
      const { first, last } = monthBounds(filter.ym);
      return series.filter((e) => e.date >= first && e.date <= last);
    }

    case "custom": {
      // An unset bound leaves that end open, matching the old app's
      // `if (S.wfrom && x.date < S.wfrom) return false` pair (582–586).
      // The old app's third branch — auto-filtering by the picker's currently
      // VIEWED month when no range was set (588–594) — is dropped: our range
      // picker is draft-based and never exposes a view month, so there is
      // nothing to read. No range set means no constraint.
      return series.filter((e) => {
        if (filter.from && e.date < filter.from) return false;
        if (filter.to && e.date > filter.to) return false;
        return true;
      });
    }
  }
}

/** A human label for the active filter, for the period tiles' subtitles. */
export function filterLabel(filter: WeightFilter): string {
  switch (filter.kind) {
    case "all":
      return "all time";
    case "week":
      return "last 7 days";
    case "month":
      return "this month";
    case "custom":
      return filter.from && filter.to ? "custom range" : "all time";
  }
}
