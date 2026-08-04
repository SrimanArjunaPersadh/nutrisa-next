import { describe, expect, it } from "vitest";

import {
  GOAL_KG,
  TARGET_RATE_KG_PER_DAY,
  eta,
  targetLine,
  trendWeight,
  weeklyAverages,
  weeklyRate,
  weeklyRateAt,
  weightDirections,
} from "../../lib/engine/trend";
import type { WeightEntry } from "../../lib/engine/types";
import fixture from "../fixtures/weight_logs.json";

/**
 * The correctness oracle (Migration Plan §6).
 *
 * `tests/fixtures/weight_logs.json` is 36 real `weight_logs` rows, offset −9.0 kg
 * for POPIA. Four rows carry `screenConfirmed` — the trend value read off the OLD
 * app's screen on 2026-07-31 — which is what makes the computed `expectedTrend`
 * column trustworthy rather than circular.
 *
 * A function here is WRONG until it reproduces these numbers exactly.
 */

type FixtureRow = {
  date: string;
  weight: number;
  expectedTrend: number;
  screenConfirmed?: number;
};

const ROWS = fixture.weight_logs as FixtureRow[];
const SERIES: WeightEntry[] = ROWS.map((r) => ({
  date: r.date,
  weight: r.weight,
}));

/** The old app renders the trend to 1 dp; that is the precision a screen can confirm. */
const toDisplayPrecision = (n: number): number => +n.toFixed(1);

const rowOn = (date: string): FixtureRow => {
  const row = ROWS.find((r) => r.date === date);
  if (!row) throw new Error(`fixture has no row for ${date}`);
  return row;
};

describe("trendWeight — the oracle", () => {
  it("reproduces every fixture row exactly", () => {
    const trend = trendWeight(SERIES);
    expect(trend).toHaveLength(ROWS.length);

    const computed = trend.map((p) => ({ date: p.date, tw: p.tw }));
    const expected = ROWS.map((r) => ({ date: r.date, tw: r.expectedTrend }));
    expect(computed).toEqual(expected);
  });

  it("matches the values read off the old app's screen", () => {
    const trend = trendWeight(SERIES);
    const confirmed = ROWS.filter((r) => r.screenConfirmed != null);

    // Guard the guard: if the fixture loses its screen-read rows, this suite has
    // quietly stopped being an oracle and started marking its own homework.
    expect(confirmed).toHaveLength(4);

    for (const row of confirmed) {
      const point = trend.find((p) => p.date === row.date);
      expect(point, `no trend point for ${row.date}`).toBeDefined();
      expect(toDisplayPrecision(point!.tw)).toBe(row.screenConfirmed);
    }
  });

  it("seeds from the first raw weight, unrounded", () => {
    const trend = trendWeight([{ date: "2026-05-05", weight: 90.123 }]);
    expect(trend).toEqual([{ date: "2026-05-05", tw: 90.123 }]);
  });

  it("rounds to 2 dp every step and feeds the ROUNDED value forward", () => {
    // The fidelity choice, pinned. The clean unrounded formula produces a
    // different final trend; if someone "cleans up" trendWeight, this fails.
    const clean = SERIES.reduce<number[]>((acc, entry, i) => {
      acc.push(i === 0 ? entry.weight : 0.1 * entry.weight + 0.9 * acc[i - 1]);
      return acc;
    }, []);

    const oracleFinal = ROWS[ROWS.length - 1].expectedTrend;
    const cleanFinal = clean[clean.length - 1];

    expect(oracleFinal).toBe(88.88);
    expect(cleanFinal).not.toBe(oracleFinal);
    expect(Math.abs(cleanFinal - oracleFinal)).toBeLessThan(0.01);
  });

  it("ignores a single-day spike — the samoosa day", () => {
    // 30 May: raw jumps +0.8 kg overnight. The trend must barely notice.
    const trend = trendWeight(SERIES);
    const spikeIndex = ROWS.findIndex((r) => r.date === "2026-05-30");
    const rawJump = ROWS[spikeIndex].weight - ROWS[spikeIndex - 1].weight;
    const trendMove = trend[spikeIndex].tw - trend[spikeIndex - 1].tw;

    expect(rawJump).toBeCloseTo(0.8, 10);
    expect(trend[spikeIndex].tw).toBe(89.28);
    expect(Math.abs(trendMove)).toBeLessThan(Math.abs(rawJump) / 10);
  });

  it("feeds smoothing forward across a 37-day gap without filling dates", () => {
    // 17 Jun → 24 Jul. One entry, therefore exactly ONE smoothing step — the
    // hole is not interpolated and contributes nothing.
    const trend = trendWeight(SERIES);
    const before = rowOn("2026-06-17");
    const after = rowOn("2026-07-24");

    const oneStep = +(0.1 * after.weight + 0.9 * before.expectedTrend).toFixed(2);
    expect(oneStep).toBe(after.expectedTrend);

    const dates = trend.map((p) => p.date);
    expect(dates).not.toContain("2026-06-18");
    expect(dates).toHaveLength(ROWS.length);
  });

  it("sorts by date, so caller order cannot change the result", () => {
    const shuffled = [...SERIES].reverse();
    expect(trendWeight(shuffled)).toEqual(trendWeight(SERIES));
  });

  it("returns an empty line for an empty series", () => {
    expect(trendWeight([])).toEqual([]);
  });

  it("does not mutate the caller's array", () => {
    const input = [...SERIES];
    trendWeight(input);
    expect(input).toEqual(SERIES);
  });
});

describe("weeklyRate — calendar dates, not array indices", () => {
  it("normalises the real 37-day reference span into a weekly figure", () => {
    // Latest row is 24 Jul; the last entry at or before 17 Jul is 17 Jun, so the
    // span is 37 days, not 7. The rate is per-week over the ACTUAL span.
    expect(weeklyRate(SERIES)).toBe(0.02);
  });

  it("computes from the trend line, not the raw weights", () => {
    const raw = [
      { date: "2026-05-01", weight: 90 },
      { date: "2026-05-08", weight: 89 },
    ];
    // Trend: 90 seed, then round2(0.1*89 + 0.9*90) = 89.9 over 7 days => -0.1/wk.
    // Raw would have said -1.0/wk.
    expect(weeklyRate(raw)).toBe(-0.1);
  });

  it("handles an exactly-7-day span", () => {
    const rate = weeklyRate([
      { date: "2026-05-01", weight: 92 },
      { date: "2026-05-04", weight: 91 },
      { date: "2026-05-08", weight: 90 },
    ]);
    // Trend: 92 → 91.9 → 91.71. Reference is 1 May (the last entry ≤ 1 May),
    // span exactly 7 days, so the weekly figure is the raw trend delta: -0.29.
    expect(rate).toBe(-0.29);
  });

  it("returns null below two weigh-ins", () => {
    expect(weeklyRate([])).toBeNull();
    expect(weeklyRate([{ date: "2026-05-05", weight: 91.1 }])).toBeNull();
  });

  it("returns null when nothing is old enough to reference", () => {
    // Both entries inside the 7-day window: no reference point exists, and the
    // honest answer is "not yet", not a number invented from two adjacent days.
    expect(
      weeklyRate([
        { date: "2026-07-22", weight: 90 },
        { date: "2026-07-24", weight: 89.5 },
      ]),
    ).toBeNull();
  });

  it("accepts a full ISO timestamp, not just a bare date", () => {
    // Phase 2 guard: if Supabase ever hands back timestamps instead of dates, the
    // rate must still compute. A NaN here would return null — a silently missing
    // rate with no error, which is the failure mode this parse defends against.
    const timestamps = [
      { date: "2026-05-01T00:00:00+00:00", weight: 90 },
      { date: "2026-05-08T00:00:00+00:00", weight: 89 },
    ];
    const bare = [
      { date: "2026-05-01", weight: 90 },
      { date: "2026-05-08", weight: 89 },
    ];
    expect(weeklyRate(timestamps)).toBe(weeklyRate(bare));
    expect(weeklyRate(timestamps)).toBe(-0.1);
  });

  it("throws on a date it cannot parse rather than returning a wrong number", () => {
    expect(() =>
      weeklyRate([
        { date: "not-a-date", weight: 90 },
        { date: "also-not-a-date", weight: 89 },
      ]),
    ).toThrow(RangeError);
  });

  it("is negative when losing weight", () => {
    const losing = [
      { date: "2026-05-01", weight: 92 },
      { date: "2026-05-15", weight: 90 },
    ];
    expect(weeklyRate(losing)!).toBeLessThan(0);
  });
});

describe("weeklyRateAt — the same algorithm, anchored anywhere", () => {
  const DATES = ROWS.map((r) => r.date);

  it("equals weeklyRate when anchored at the last weigh-in", () => {
    const last = DATES[DATES.length - 1];
    expect(weeklyRateAt(SERIES, last)).toBe(weeklyRate(SERIES));
    expect(weeklyRateAt(SERIES, last)).toBe(0.02);
  });

  it("carries months of smoothing into a mid-series anchor", () => {
    // THE POINT OF THIS FUNCTION (PHASE-3-DECISIONS §2, §9). Anchored on 16 Jun,
    // the reference is 9 Jun — 7 days back — and both trend values come from a
    // line seeded way back on 5 May.
    expect(weeklyRateAt(SERIES, "2026-06-16")).toBe(0.02);
  });

  it("differs from re-running the engine on a filtered slice", () => {
    // The bug this function exists to make impossible. A "June" view that hands
    // weeklyRate its own slice re-seeds the EMA at June's first weigh-in and gets
    // a plausible, wrong number with no error anywhere.
    const june = SERIES.filter((e) => e.date.startsWith("2026-06"));
    const correct = weeklyRateAt(SERIES, "2026-06-16");
    const wrong = weeklyRateAt(june, "2026-06-16");

    expect(correct).toBe(0.02);
    expect(wrong).not.toBe(correct);
  });

  it("returns null for a date that is not a weigh-in", () => {
    // No interpolating to a neighbour: the caller asked about a day we did not
    // weigh in on, and the honest answer is nothing.
    expect(weeklyRateAt(SERIES, "2026-06-18")).toBeNull();
    expect(weeklyRateAt(SERIES, "2026-01-01")).toBeNull();
  });

  it("returns null when nothing is old enough to reference", () => {
    // 7 May is the second weigh-in ever; the cutoff lands before the series began.
    expect(weeklyRateAt(SERIES, "2026-05-07")).toBeNull();
  });

  it("returns null on an empty series", () => {
    expect(weeklyRateAt([], "2026-05-05")).toBeNull();
  });
});

describe("weeklyAverages — Monday-started buckets", () => {
  const WEEKS = weeklyAverages(SERIES);

  it("buckets the first week from the Monday BEFORE the first weigh-in", () => {
    // 5 May 2026 is a Tuesday, so its week starts Mon 4 May and holds the first
    // four weigh-ins: 91.1, 88.9, 89.8, 90.3.
    expect(WEEKS[0]).toEqual({ weekStart: "2026-05-04", avg: 90.0, n: 4 });
  });

  it("starts every bucket on a Monday, in UTC", () => {
    for (const week of WEEKS) {
      const dow = new Date(`${week.weekStart}T00:00:00Z`).getUTCDay();
      expect(dow, `${week.weekStart} is not a Monday`).toBe(1);
    }
  });

  it("puts a Sunday in the week that STARTED six days earlier", () => {
    // The off-by-one every ISO-week implementation gets wrong: getUTCDay() calls
    // Sunday 0, but ISO calls it day 7 — the END of its week, not the start.
    expect(weeklyAverages([{ date: "2026-05-10", weight: 90 }])).toEqual([
      { weekStart: "2026-05-04", avg: 90, n: 1 },
    ]);
  });

  it("accounts for every weigh-in exactly once", () => {
    expect(WEEKS.reduce((sum, w) => sum + w.n, 0)).toBe(ROWS.length);
  });

  it("omits weeks with no weigh-ins rather than zero-filling them", () => {
    // The 37-day hole spans five empty weeks. They are absent, not zeroed — a
    // zero-filled week would drag every average and read as a 0 kg body weight.
    const starts = WEEKS.map((w) => w.weekStart);
    expect(starts).toContain("2026-06-15");
    expect(starts).toContain("2026-07-20");
    expect(starts).not.toContain("2026-06-22");
    expect(starts).not.toContain("2026-07-13");
  });

  it("is ordered oldest week first, whatever order the caller passes", () => {
    expect(weeklyAverages([...SERIES].reverse())).toEqual(WEEKS);
  });

  it("returns numbers, not the old app's formatted strings", () => {
    for (const week of WEEKS) {
      expect(typeof week.avg).toBe("number");
    }
  });

  it("returns an empty list for an empty series", () => {
    expect(weeklyAverages([])).toEqual([]);
  });
});

describe("targetLine — anchored to the journey, not the viewport", () => {
  const DATES = ROWS.map((r) => r.date);

  it("starts at the first weigh-in and descends 0.5 kg a week", () => {
    const line = targetLine(SERIES, DATES);
    expect(line).toHaveLength(ROWS.length);
    expect(line[0]).toBe(91.1); // day 0 — the anchor itself
    // 12 May is 7 days on: exactly half a kilo below.
    expect(line[DATES.indexOf("2026-05-12")]).toBe(90.6);
  });

  it("keeps its anchor when the caller shows only a slice — THE ZOOM FIX", () => {
    // Plan §5.3 / PHASE-3-DECISIONS §2. The old app passed its filtered slice as
    // both arguments, so switching to a June view re-anchored the amber line to
    // June's first weigh-in (87.3) and the whole line jumped down the chart.
    const juneDates = DATES.filter((d) => d.startsWith("2026-06"));
    const june = SERIES.filter((e) => e.date.startsWith("2026-06"));

    const fixed = targetLine(SERIES, juneDates);
    const oldBehaviour = targetLine(june, juneDates);

    // 1 Jun is 27 days after 5 May: 91.1 − (0.5/7 × 27) = 89.17.
    expect(fixed[0]).toBe(89.17);
    expect(oldBehaviour[0]).toBe(87.3);
    expect(fixed[0]).not.toBe(oldBehaviour[0]);
  });

  it("gives the same value for a date however the window is sliced", () => {
    // The property the fix buys: one date, one target value, always.
    const all = targetLine(SERIES, DATES);
    const one = targetLine(SERIES, ["2026-06-16"]);
    expect(one[0]).toBe(all[DATES.indexOf("2026-06-16")]);
  });

  it("returns one value per requested date, in the order given", () => {
    // Chart.js reads this as a parallel array, so order is load-bearing.
    const line = targetLine(SERIES, ["2026-07-24", "2026-05-05"]);
    expect(line).toHaveLength(2);
    expect(line[1]).toBe(91.1);
    expect(line[0]).toBeLessThan(line[1]);
  });

  it("projects past the last weigh-in without needing a reading there", () => {
    // 4 Aug 2026 is 91 days out: 91.1 − 6.5 = 84.6.
    expect(targetLine(SERIES, ["2026-08-04"])[0]).toBe(84.6);
  });

  it("descends at exactly half a kilo per week", () => {
    expect(TARGET_RATE_KG_PER_DAY * 7).toBeCloseTo(0.5, 10);
  });

  it("draws nothing without a history to anchor to", () => {
    expect(targetLine([], DATES)).toEqual([]);
    expect(targetLine(SERIES, [])).toEqual([]);
  });
});

describe("eta — from the trend, at the assumed rate, from today", () => {
  const TODAY = new Date(2026, 6, 31); // 31 Jul 2026, local — eta counts in local days

  it("projects from the latest TREND weight", () => {
    // Trend on 24 Jul is 88.88. (88.88 - 88) / 0.5 * 7 = 12.32 → 12 days.
    const result = eta(SERIES, TODAY);
    expect(result.kind).toBe("projected");
    if (result.kind !== "projected") return;

    expect(result.date.getFullYear()).toBe(2026);
    expect(result.date.getMonth()).toBe(7); // August
    expect(result.date.getDate()).toBe(12);
  });

  it("ignores a raw spike that the trend absorbed", () => {
    // The 24 Jul raw reading is 90.0 — a whole 2 kg above goal. Projecting from
    // raw would give 28 days; the trend gives 12. This IS FIX #2.
    const result = eta(SERIES, TODAY);
    if (result.kind !== "projected") throw new Error("expected a projection");

    const rawDays = Math.round(((90.0 - GOAL_KG) / 0.5) * 7);
    const projectedDays = Math.round(
      (result.date.getTime() - TODAY.getTime()) / 864e5,
    );
    expect(rawDays).toBe(28);
    expect(projectedDays).toBe(12);
  });

  it("reports the goal reached once the trend is at or below it", () => {
    expect(eta([{ date: "2026-07-24", weight: 88 }], TODAY).kind).toBe("reached");
    expect(eta([{ date: "2026-07-24", weight: 84.2 }], TODAY).kind).toBe(
      "reached",
    );
  });

  it("returns no-data for an empty series (the ORACLE EXCEPTION)", () => {
    // The old app answers "Goal reached!" here, because lw() is 0 and 0 <= 88.
    // Deliberate departure: no stored row can produce it, so no oracle value is
    // being violated. See docs/PHASE-1-DECISIONS.md.
    expect(eta([], TODAY)).toEqual({ kind: "no-data" });
  });

  it("does not mutate the date it is given", () => {
    const today = new Date(2026, 6, 31);
    eta(SERIES, today);
    expect(today.getTime()).toBe(new Date(2026, 6, 31).getTime());
  });

  it("counts forward from today, not from the last weigh-in", () => {
    // Carried-forward old-app behaviour: a later 'today' pushes the ETA out even
    // though the underlying series has not changed.
    const later = eta(SERIES, new Date(2026, 7, 31));
    const earlier = eta(SERIES, TODAY);
    if (later.kind !== "projected" || earlier.kind !== "projected") {
      throw new Error("expected projections");
    }
    expect(later.date.getTime()).toBeGreaterThan(earlier.date.getTime());
  });
});

describe("weightDirections — compared to the true predecessor, not the visible one", () => {
  const DATES = ROWS.map((r) => r.date);

  it("reads each weigh-in against the one before it", () => {
    const dirs = weightDirections(SERIES, DATES);
    expect(dirs).toHaveLength(ROWS.length);

    expect(dirs[0]).toBe("first"); // 5 May, 91.1 — nothing to compare against
    expect(dirs[DATES.indexOf("2026-05-07")]).toBe("down"); // 88.9 after 91.1
    expect(dirs[DATES.indexOf("2026-05-08")]).toBe("up"); // 89.8 after 88.9
  });

  it("distinguishes flat from first", () => {
    // 12 May is 90.3 and so was 9 May — the scale did not move.
    expect(weightDirections(SERIES, DATES)[DATES.indexOf("2026-05-12")]).toBe(
      "flat",
    );
  });

  it("keeps a dot's colour when the window scrolls past it — THE ZOOM FIX", () => {
    // PHASE-3-DECISIONS §2. 1 Jun (87.3) is a real loss against 31 May (88.2),
    // but the old app compared it to `data[i-1]` of the FILTERED slice, where it
    // had no predecessor — so filtering to June turned a green dot blue.
    const juneDates = DATES.filter((d) => d.startsWith("2026-06"));
    const june = SERIES.filter((e) => e.date.startsWith("2026-06"));

    expect(weightDirections(SERIES, juneDates)[0]).toBe("down");
    expect(weightDirections(june, juneDates)[0]).toBe("first"); // old behaviour
  });

  it("gives the same direction for a date however the window is sliced", () => {
    const all = weightDirections(SERIES, DATES);
    const one = weightDirections(SERIES, ["2026-06-16"]);
    expect(one[0]).toBe(all[DATES.indexOf("2026-06-16")]);
  });

  it("reports first for a date the series does not contain", () => {
    expect(weightDirections(SERIES, ["1999-01-01"])).toEqual(["first"]);
  });

  it("has no directions to report for an empty history", () => {
    expect(weightDirections([], [])).toEqual([]);
  });
});
