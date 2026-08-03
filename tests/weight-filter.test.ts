import { describe, expect, it } from "vitest";

import {
  filterWeights,
  monthBounds,
  offsetMonth,
  weekStart,
} from "@/lib/weight-filter";
import type { WeightEntry } from "@/lib/engine/types";

/**
 * Boundary behaviour for the Week/Month/All/Custom filter.
 *
 * Filters decide what is DRAWN, never what anything means — but an off-by-one
 * here silently drops a weigh-in from the period tiles, so the edges are pinned.
 */

const SERIES: WeightEntry[] = [
  { date: "2026-05-31", weight: 91.0 },
  { date: "2026-06-01", weight: 90.5 },
  { date: "2026-06-15", weight: 90.0 },
  { date: "2026-06-30", weight: 89.5 },
  { date: "2026-07-01", weight: 89.0 },
];

const dates = (rows: WeightEntry[]) => rows.map((r) => r.date);

describe("weekStart — seven calendar days ending today", () => {
  it("includes today and the six days before it", () => {
    expect(weekStart("2026-07-08")).toBe("2026-07-02");
  });

  it("crosses a month boundary", () => {
    expect(weekStart("2026-07-03")).toBe("2026-06-27");
  });

  it("crosses a year boundary", () => {
    expect(weekStart("2026-01-03")).toBe("2025-12-28");
  });

  it("does not depend on the time of day", () => {
    // The old app's window shifted with the clock (see the note on weekStart).
    // Same day in, same window out, whenever it is called.
    expect(weekStart("2026-07-08")).toBe(weekStart("2026-07-08"));
  });
});

describe("monthBounds", () => {
  it("handles a 31-day month", () => {
    expect(monthBounds("2026-07")).toEqual({
      first: "2026-07-01",
      last: "2026-07-31",
    });
  });

  it("handles a 30-day month", () => {
    expect(monthBounds("2026-06")).toEqual({
      first: "2026-06-01",
      last: "2026-06-30",
    });
  });

  it("handles February in a non-leap year", () => {
    expect(monthBounds("2026-02").last).toBe("2026-02-28");
  });

  it("handles February in a leap year", () => {
    expect(monthBounds("2028-02").last).toBe("2028-02-29");
  });
});

describe("offsetMonth", () => {
  it("steps back across a year boundary", () => {
    expect(offsetMonth("2026-01", -1)).toBe("2025-12");
  });

  it("steps forward across a year boundary", () => {
    expect(offsetMonth("2026-12", 1)).toBe("2027-01");
  });
});

describe("filterWeights", () => {
  it("all returns everything, as a copy", () => {
    const out = filterWeights(SERIES, { kind: "all" });
    expect(out).toEqual(SERIES);
    expect(out).not.toBe(SERIES);
  });

  it("week includes both edges of the seven-day window", () => {
    // Window for 2026-07-01 is 2026-06-25 .. 2026-07-01.
    const out = filterWeights(SERIES, { kind: "week" }, "2026-07-01");
    expect(dates(out)).toEqual(["2026-06-30", "2026-07-01"]);
  });

  it("month includes the first and last day", () => {
    const out = filterWeights(SERIES, { kind: "month", ym: "2026-06" });
    expect(dates(out)).toEqual(["2026-06-01", "2026-06-15", "2026-06-30"]);
  });

  it("custom is inclusive at both bounds", () => {
    const out = filterWeights(SERIES, {
      kind: "custom",
      from: "2026-06-01",
      to: "2026-06-30",
    });
    expect(dates(out)).toEqual(["2026-06-01", "2026-06-15", "2026-06-30"]);
  });

  it("custom leaves an unset bound open", () => {
    expect(
      dates(filterWeights(SERIES, { kind: "custom", from: "2026-06-30", to: "" })),
    ).toEqual(["2026-06-30", "2026-07-01"]);

    expect(
      dates(filterWeights(SERIES, { kind: "custom", from: "", to: "2026-06-01" })),
    ).toEqual(["2026-05-31", "2026-06-01"]);
  });

  it("custom with no bounds at all constrains nothing", () => {
    expect(
      filterWeights(SERIES, { kind: "custom", from: "", to: "" }),
    ).toEqual(SERIES);
  });

  it("returns an empty slice when nothing falls in the window", () => {
    expect(filterWeights(SERIES, { kind: "month", ym: "2026-09" })).toEqual([]);
  });

  it("preserves the series order", () => {
    const out = filterWeights(SERIES, { kind: "all" });
    expect(dates(out)).toEqual([...dates(out)].sort());
  });
});
