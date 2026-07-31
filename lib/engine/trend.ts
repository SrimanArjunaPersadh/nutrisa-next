/**
 * Trend weight, weekly rate, ETA — Migration Plan §6.
 *
 * Ported from the old app's `tL()`, `wr()` (FIX #1) and `eta()` (FIX #2) in
 * `docs/reference/old-index.html` (lines 527, 538, 554). Pure, typed, no deps.
 *
 * The old app's displayed numbers are the correctness oracle (§6). Every
 * behaviour below — including the ones that are arguably bugs — is reproduced
 * deliberately. Where this file departs from the old app, the departure is
 * marked ORACLE EXCEPTION and justified in `docs/PHASE-1-DECISIONS.md`.
 */

import type { TrendPoint, WeightEntry } from "./types";

/** The goal weight the whole app projects toward. Old app: `const GOAL = 88`. */
export const GOAL_KG = 88;

/**
 * The rate `eta()` projects at — an ASSUMED half-kilo a week, NOT the measured
 * `weeklyRate`. Old app line 560 hardcodes `0.5` even though `RATET = 0.5 / 7`
 * exists two hundred lines above it. Carried forward unchanged (§6 oracle);
 * see PHASE-1-DECISIONS.md if this ever looks like something to "fix".
 */
export const ASSUMED_RATE_KG_PER_WEEK = 0.5;

/** Smoothing factor. Frozen at 0.1 — the MacroFactor constant. */
const ALPHA = 0.1;

const MS_PER_DAY = 864e5;

/**
 * Round to 2 dp the way the old app does.
 *
 * MUST stay `+n.toFixed(2)` and NOT `Math.round(n * 100) / 100`. The two agree
 * on the current fixture but diverge on exact-half decimal representations, and
 * `toFixed` is what produced every stored oracle value.
 */
function round2(n: number): number {
  return +n.toFixed(2);
}

/**
 * Milliseconds for an ISO date, parsed as UTC midnight like the old app.
 *
 * Takes the `YYYY-MM-DD` prefix so a full timestamp (`2026-07-24T00:00:00+00:00`)
 * parses too.
 *
 * CONFIRMED 2026-07-31 against the live DB (Phase 2 survey): `weight_logs.date`
 * returns a BARE `YYYY-MM-DD`, on all 36 rows, as do `meal_logs.date` and
 * `water_logs.date`. The old app's comment claiming Supabase returns
 * `'YYYY-MM-DDT00:00:00'` for date columns (old-index.html:1882) is wrong, and its
 * `.slice(0,10)` is a no-op.
 *
 * The prefix guard STAYS anyway: a naive `Date.parse(date + "T00:00:00Z")` on a
 * timestamp yields NaN, and NaN would make `weeklyRate` return `null` — a missing
 * rate with no error anywhere, the hardest kind of wrong to notice. A weigh-in is a
 * calendar day, so the day prefix is the right unit whatever shape the row arrives
 * in. Cheap insurance against a column type that is not ours to control.
 *
 * @throws if no parseable date is present, rather than poisoning the arithmetic.
 */
function msFromIsoDate(date: string): number {
  const ms = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(ms)) {
    throw new RangeError(`unparseable weigh-in date: ${JSON.stringify(date)}`);
  }
  return ms;
}

/**
 * Sort weigh-ins oldest-first by ISO date string.
 *
 * The old app's `tL`/`wr`/`eta` never sort — every call site sorts first via
 * `sW()` (line 487, `a.date.localeCompare(b.date)`). We fold that sort into the
 * engine instead: identical results on every real call, and a Phase 3 caller
 * cannot silently produce a wrong trend line by forgetting it.
 */
export function sortByDate(series: readonly WeightEntry[]): WeightEntry[] {
  return [...series].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The trend line: exponential smoothing, α = 0.1.
 *
 *     tw[0] = w[0]                                  (raw seed, UNROUNDED)
 *     tw[i] = round(0.1 * w[i] + 0.9 * tw[i - 1], 2)
 *
 * The 2 dp rounding happens EVERY step and the ROUNDED value feeds the next
 * step. That is a different algorithm from the clean unrounded formula and it
 * drifts from it over a long series (−0.0061 kg by row 36 of the fixture). We
 * match the old app, not the clean maths, because the old app's numbers are the
 * oracle. Locked 2026-07-31 — do not "clean this up" without re-verifying the
 * whole series against the old app's screen.
 *
 * Gaps in the series are NOT filled. Smoothing steps once per ENTRY, never per
 * calendar day, so a 37-day hole is one step exactly like a consecutive day is.
 * That is the old app's behaviour and the fixture's 24 Jul row tests it.
 */
export function trendWeight(series: readonly WeightEntry[]): TrendPoint[] {
  const ws = sortByDate(series);
  if (ws.length === 0) return [];

  const out: TrendPoint[] = [{ date: ws[0].date, tw: ws[0].weight }];
  for (let i = 1; i < ws.length; i++) {
    out.push({
      date: ws[i].date,
      tw: round2(ALPHA * ws[i].weight + (1 - ALPHA) * out[i - 1].tw),
    });
  }
  return out;
}

/**
 * Weekly rate of change in kg/week, from the TREND line and CALENDAR dates
 * (old app FIX #1 — the original used array indices, which lied whenever a day
 * was skipped). Negative = losing.
 *
 * Reference point is the last trend entry at or before 7 calendar days back
 * from the latest one. When weigh-ins are sparse that span can be much wider
 * than 7 days — the fixture's latest row reaches back 37 days — and the rate is
 * normalised over the ACTUAL span, not assumed to be a week.
 *
 * `null` (not 0, not a guess) when there is nothing honest to report: fewer than
 * two weigh-ins, or no entry old enough to reference.
 */
export function weeklyRate(series: readonly WeightEntry[]): number | null {
  const ws = sortByDate(series);
  if (ws.length < 2) return null;

  const trend = trendWeight(ws);
  const last = trend[trend.length - 1];
  const cutoffMs = msFromIsoDate(last.date) - 7 * MS_PER_DAY;

  const ref = trend.filter((x) => msFromIsoDate(x.date) <= cutoffMs).pop();
  if (!ref) return null;

  const days = (msFromIsoDate(last.date) - msFromIsoDate(ref.date)) / MS_PER_DAY;
  if (days === 0) return null;

  return round2(((last.tw - ref.tw) / days) * 7);
}

/** What `eta()` can conclude. The caller formats it; the engine never returns a string. */
export type EtaResult =
  /** No weigh-ins at all — nothing to project from. */
  | { readonly kind: "no-data" }
  /** Trend weight is at or below goal. */
  | { readonly kind: "reached" }
  /** Projected calendar date the goal is reached. */
  | { readonly kind: "projected"; readonly date: Date };

/**
 * Projected date of reaching {@link GOAL_KG}, from the TREND weight rather than
 * the latest raw reading (old app FIX #2 — a single samoosa day no longer moves
 * the goal date).
 *
 * Two old-app behaviours carried forward deliberately, both arguably wrong:
 *   1. It projects at {@link ASSUMED_RATE_KG_PER_WEEK}, NOT at the measured
 *      `weeklyRate`. The ETA is "when would I arrive at target pace", not "at
 *      current pace".
 *   2. It counts forward from TODAY, not from the last weigh-in's date. Stop
 *      weighing in for a fortnight and the projection quietly slides.
 *
 * `today` is a parameter rather than a `new Date()` call inside the function —
 * the old app read the wall clock directly, which makes it untestable. Same
 * value, injected.
 *
 * ORACLE EXCEPTION: an empty series returns `no-data`. The old app returns
 * "Goal reached!" here, because `lw()` yields 0 for an empty series and
 * `0 <= 88`. That is a real defect, but no stored row can produce it (the DB
 * has never been empty), so there is no oracle value being violated.
 */
export function eta(series: readonly WeightEntry[], today: Date): EtaResult {
  const trend = trendWeight(series);
  if (trend.length === 0) return { kind: "no-data" };

  const tw = trend[trend.length - 1].tw;
  if (tw <= GOAL_KG) return { kind: "reached" };

  const date = new Date(today.getTime());
  const daysOut = Math.round(
    ((tw - GOAL_KG) / ASSUMED_RATE_KG_PER_WEEK) * 7,
  );
  date.setDate(date.getDate() + daysOut);
  return { kind: "projected", date };
}
