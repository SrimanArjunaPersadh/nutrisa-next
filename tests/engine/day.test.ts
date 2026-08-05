import { describe, expect, it } from "vitest";

import {
  CARB_MAX,
  CARB_MIN,
  CEILINGS,
  FAT_MAX,
  FAT_MIN,
  KCAL_MAX,
  KCAL_MIN,
  PRO_MAX,
  PRO_MIN,
  dayTotals,
  macroStatus,
  remaining,
  remainingMacros,
} from "../../lib/engine/day";
import fixture from "../fixtures/meal_logs.json";

/**
 * The correctness oracle (Migration Plan §6) for a day's totals.
 *
 * `tests/fixtures/meal_logs.json` carries two REAL logged days and, alongside
 * them, a `dayTotals` block transcribed from the old app independently of this
 * code. `dayTotals()` is WRONG until it reproduces those four figures per day.
 *
 * 2026-06-03 is the interesting one: `sort_order` is `[3,3,3,4,8]` — duplicates
 * and a gap, because a delete never renumbers. Totals must not care.
 */

type FixtureRow = {
  expected: { kcal: number; pro: number; carb: number; fat: number };
  row: { date: string };
};

const ROWS = (fixture as { rows: FixtureRow[] }).rows;
const ORACLE = (fixture as unknown as {
  dayTotals: Record<string, { kcal: number; pro: number; carb: number; fat: number }>;
}).dayTotals;

const mealsOn = (date: string) =>
  ROWS.filter((r) => r.row.date === date).map((r) => r.expected);

describe("dayTotals — the oracle", () => {
  it.each(Object.keys(ORACLE))("reproduces the old app's totals for %s", (date) => {
    expect(dayTotals(mealsOn(date))).toEqual(ORACLE[date]);
  });

  it("is unbothered by duplicate and gapped sort_order", () => {
    // 2026-06-03 has [3,3,3,4,8]. Totals are a sum; order cannot matter.
    const meals = mealsOn("2026-06-03");
    const reversed = [...meals].reverse();
    expect(dayTotals(reversed)).toEqual(dayTotals(meals));
  });

  it("rounds ONCE at the end, not per meal", () => {
    // Three meals at 0.4 kcal total 1.2 → 1. Rounding each first gives 0.
    const meals = [0.4, 0.4, 0.4].map((kcal) => ({
      kcal,
      pro: 0,
      carb: 0,
      fat: 0,
    }));
    expect(dayTotals(meals).kcal).toBe(1);
  });

  it("keeps the macros at 1 dp the toFixed way", () => {
    // 0.1 + 0.2 is 0.30000000000000004 in IEEE 754. The old app's +toFixed(1)
    // is what keeps that off the screen.
    const meals = [
      { kcal: 0, pro: 0.1, carb: 0, fat: 0 },
      { kcal: 0, pro: 0.2, carb: 0, fat: 0 },
    ];
    expect(dayTotals(meals).pro).toBe(0.3);
  });

  it("an empty day is four zeros, not four nulls", () => {
    // Nothing logged is a real answer: you have eaten nothing yet today.
    expect(dayTotals([])).toEqual({ kcal: 0, pro: 0, carb: 0, fat: 0 });
  });
});

describe("remaining — signed, so the view can say 'over'", () => {
  it("counts down to the ceiling", () => {
    expect(remaining(1771, KCAL_MAX)).toBe(629);
  });

  it("goes negative rather than clamping at zero", () => {
    // PHASE-4-DECISIONS §2: the engine subtracts, the view decides how to say it.
    expect(remaining(2540, KCAL_MAX)).toBe(-140);
  });

  it("does not leak floating-point noise onto a tile", () => {
    // 2400 − 2360.1 is 39.900000000000006 unrounded.
    expect(remaining(2360.1, KCAL_MAX)).toBe(39.9);
  });

  it("is exactly zero at the ceiling", () => {
    expect(remaining(KCAL_MAX, KCAL_MAX)).toBe(0);
  });

  it("computes all four against the ceilings", () => {
    expect(remainingMacros(ORACLE["2026-06-01"])).toEqual({
      kcal: KCAL_MAX - 1771,
      pro: +(PRO_MAX - 145.3).toFixed(1),
      carb: +(CARB_MAX - 172.6).toFixed(1),
      fat: +(FAT_MAX - 44.3).toFixed(1),
    });
  });

  it("ceilings are the old app's constants", () => {
    expect(CEILINGS).toEqual({ kcal: 2400, pro: 175, carb: 210, fat: 65 });
  });
});

describe("macroStatus — meaning, never a colour", () => {
  it("is over above the max, and only above it", () => {
    expect(macroStatus(KCAL_MAX + 1, KCAL_MIN, KCAL_MAX)).toBe("over");
    expect(macroStatus(KCAL_MAX, KCAL_MIN, KCAL_MAX)).toBe("in-range");
  });

  it("is in-range from the min up", () => {
    expect(macroStatus(KCAL_MIN, KCAL_MIN, KCAL_MAX)).toBe("in-range");
    expect(macroStatus(KCAL_MIN - 0.1, KCAL_MIN, KCAL_MAX)).toBe("under");
  });

  it("handles protein's degenerate range, where min === max", () => {
    // The old app sets PRO_MIN = PRO_TARGET = PRO_MAX = 175 (line 440), so
    // exactly-175 is the only in-range value there is.
    expect(macroStatus(175, PRO_MIN, PRO_MAX)).toBe("in-range");
    expect(macroStatus(175.1, PRO_MIN, PRO_MAX)).toBe("over");
    expect(macroStatus(174.9, PRO_MIN, PRO_MAX)).toBe("under");
  });

  it("reads the two real days the way the old tiles did", () => {
    const d1 = ORACLE["2026-06-01"];
    // A light day: 1771 kcal against a 2200 floor, and every macro short of its
    // minimum too — carbs 172.6 vs 180, fat 44.3 vs 55.
    expect(macroStatus(d1.kcal, KCAL_MIN, KCAL_MAX)).toBe("under");
    expect(macroStatus(d1.pro, PRO_MIN, PRO_MAX)).toBe("under");
    expect(macroStatus(d1.carb, CARB_MIN, CARB_MAX)).toBe("under");
    expect(macroStatus(d1.fat, FAT_MIN, FAT_MAX)).toBe("under");

    const d3 = ORACLE["2026-06-03"];
    // 2385 sits inside 2200–2400; carbs at 244.9 blow the 210 ceiling.
    expect(macroStatus(d3.kcal, KCAL_MIN, KCAL_MAX)).toBe("in-range");
    expect(macroStatus(d3.pro, PRO_MIN, PRO_MAX)).toBe("over");
    expect(macroStatus(d3.carb, CARB_MIN, CARB_MAX)).toBe("over");
    expect(macroStatus(d3.fat, FAT_MIN, FAT_MAX)).toBe("in-range");
  });
});
