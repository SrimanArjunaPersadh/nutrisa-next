import { describe, expect, it } from "vitest";

import {
  GOAL_KG,
  eta,
  trendWeight,
  weeklyRate,
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
