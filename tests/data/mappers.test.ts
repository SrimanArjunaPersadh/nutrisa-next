import { describe, expect, it } from "vitest";

import {
  customFoodConflictTarget,
  customFoodToUpsert,
  customMealToUpsert,
  ingredientQty,
  isoDay,
  loggedMealToInsert,
  parseIngsJson,
  rowToCustomFood,
  rowToCustomMeal,
  rowToLoggedMeal,
  rowToWeightEntry,
} from "../../lib/data/mappers";
import { macrosForQuantity } from "../../lib/engine/macros";
import type {
  CustomFoodRow,
  CustomMealRow,
  MealRow,
  WeightRow,
} from "../../lib/data/types";

import mealFixture from "../fixtures/meal_logs.json";
import customMealFixture from "../fixtures/custom_meals.json";
import customFoodFixture from "../fixtures/custom_foods.json";
import weightFixture from "../fixtures/weight_logs.json";

/**
 * The correctness oracle for the row↔object mapping (Plan §6, Phase 2).
 *
 * Every `expected` in these fixtures was produced by transcribing the OLD APP's
 * mapping code (old-index.html:1895–1905, 1935–1946, 1959–1969, 900–919)
 * INDEPENDENTLY of `lib/data/mappers.ts`. Two separate transcriptions of the same
 * source must agree — that is what makes this an oracle rather than the mapper
 * marking its own homework.
 *
 * Rows are real, pulled from the live DB on 2026-07-31. Only row ids are scrubbed
 * (synthetic UUIDs, POPIA — this repo is public). Every macro is verbatim.
 */

describe("weight_logs → WeightEntry", () => {
  it("maps date and weight, on every real row", () => {
    for (const entry of weightFixture.weight_logs) {
      const row = {
        id: "irrelevant",
        date: entry.date,
        weight: entry.weight,
        created_at: "2026-06-01T00:00:00+00:00",
      } satisfies WeightRow;

      expect(rowToWeightEntry(row)).toEqual({
        date: entry.date,
        weight: entry.weight,
      });
    }
  });

  it("does not round the weight — trendWeight owns that", () => {
    const row = {
      id: "x",
      date: "2026-05-05",
      weight: 100.126,
      created_at: "",
    } satisfies WeightRow;
    expect(rowToWeightEntry(row).weight).toBe(100.126);
  });

  it("coerces a numeric returned as a string", () => {
    const row = {
      id: "x",
      date: "2026-05-05",
      weight: "91.10",
      created_at: "",
    } satisfies WeightRow;
    expect(rowToWeightEntry(row).weight).toBe(91.1);
  });
});

describe("meal_logs → LoggedMeal (real rows)", () => {
  const cases = mealFixture.rows as { row: MealRow; expected: Record<string, unknown> }[];

  it.each(cases)("$row.name", ({ row, expected }) => {
    const mapped = rowToLoggedMeal(row);

    // `sortOrder` is ours: the old app never carried sort_order into its object,
    // because it read the local array's length instead. We need it to compute the
    // NEXT one (PHASE-2-DECISIONS §5), so it is asserted separately.
    const { sortOrder, ...rest } = mapped;
    expect(rest).toEqual(expected);
    expect(sortOrder).toBe(row.sort_order);
  });

  it("carries sort_order through as stored — 1-based, gaps and duplicates intact", () => {
    const june3 = cases
      .filter((c) => c.row.date === "2026-06-03")
      .map((c) => rowToLoggedMeal(c.row).sortOrder);

    // Real stored data. A delete never renumbers, so the next insert reuses a
    // length: hence the repeats and the jump to 8.
    expect(june3).toEqual([3, 3, 3, 4, 8]);
    expect(Math.min(...june3)).toBeGreaterThan(0);
  });

  it("reproduces the old app's day totals", () => {
    for (const [date, total] of Object.entries(mealFixture.dayTotals)) {
      const day = cases
        .filter((c) => c.row.date === date)
        .map((c) => rowToLoggedMeal(c.row));

      expect({
        kcal: day.reduce((s, m) => s + m.kcal, 0),
        pro: +day.reduce((s, m) => s + m.pro, 0).toFixed(1),
        carb: +day.reduce((s, m) => s + m.carb, 0).toFixed(1),
        fat: +day.reduce((s, m) => s + m.fat, 0).toFixed(1),
      }).toEqual(total);
    }
  });

  it("rounds on READ — kcal whole, macros 1 dp", () => {
    const row = {
      id: "x",
      date: "2026-06-01",
      name: "hypothetical precision",
      kcal: 287.6,
      pro: 23.64,
      carb: 35.95,
      fat: 3.749,
      logged_time: "1:03",
      sort_order: 1,
      lib_id: null,
      ings_json: null,
      created_at: "",
    } satisfies MealRow;

    const m = rowToLoggedMeal(row);
    expect(m.kcal).toBe(288);
    expect(m.pro).toBe(23.6);
    expect(m.carb).toBe(36);
    expect(m.fat).toBe(3.7);
  });

  it("treats lib_id as a NAME, not an id", () => {
    const withLib = cases.find((c) => c.row.lib_id !== null);
    expect(withLib, "fixture should contain a row with lib_id").toBeDefined();
    expect(rowToLoggedMeal(withLib!.row)._libId).toBe(withLib!.row.lib_id);
    expect(withLib!.row.lib_id).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });

  it("keeps logged_time as free text, unparsed", () => {
    const times = cases.map((c) => rowToLoggedMeal(c.row).time);
    expect(times).toContain("1:03");
    for (const t of times) expect(typeof t).toBe("string");
  });
});

describe("ings_json", () => {
  it("parses a real stored list", () => {
    const withIngs = (mealFixture.rows as { row: MealRow }[]).find(
      (c) => c.row.ings_json,
    )!;
    const ings = parseIngsJson(withIngs.row.ings_json)!;
    expect(ings.length).toBeGreaterThan(0);
    expect(ings[0]).toHaveProperty("name");
    expect(typeof ings[0].qty).toBe("string");
  });

  it("returns null for null, and for unparseable JSON — never throws", () => {
    expect(parseIngsJson(null)).toBeNull();
    expect(parseIngsJson("")).toBeNull();
    expect(parseIngsJson("{not json")).toBeNull();
  });
});

describe("ingredientQty — the two tables disagree on format", () => {
  it("reads meal_logs bare qty and custom_meals suffixed qty identically", () => {
    expect(ingredientQty("80")).toBe(80); // meal_logs convention
    expect(ingredientQty("80g")).toBe(80); // custom_meals convention
    expect(ingredientQty("0.75")).toBe(0.75);
    expect(ingredientQty("0.9g")).toBe(0.9);
  });

  it("returns 0 for junk, like the old app's parseFloat(x)||0", () => {
    expect(ingredientQty("")).toBe(0);
    expect(ingredientQty("some")).toBe(0);
  });

  it("both conventions are actually present in the real fixtures", () => {
    const mealQtys = (mealFixture.rows as { row: MealRow }[])
      .flatMap((c) => parseIngsJson(c.row.ings_json) ?? [])
      .map((i) => i.qty);
    const customQtys = (
      customMealFixture.rows as { row: CustomMealRow }[]
    ).flatMap((c) => c.row.ingredients ?? []).map((i) => i.qty);

    expect(mealQtys.some((q) => /^[\d.]+$/.test(q))).toBe(true);
    expect(customQtys.some((q) => /[a-z]$/i.test(q))).toBe(true);
  });
});

describe("custom_meals → CustomMeal (real rows)", () => {
  const cases = customMealFixture.rows as {
    row: CustomMealRow;
    expected: Record<string, unknown>;
  }[];

  it.each(cases)("$row.name", ({ row, expected }) => {
    expect(rowToCustomMeal(row)).toEqual(expected);
  });

  it("exposes the id twice, as _id and id (old app 1936–1937)", () => {
    const m = rowToCustomMeal(cases[0].row);
    expect(m._id).toBe(cases[0].row.id);
    expect(m.id).toBe(cases[0].row.id);
  });

  it("takes ingredients already parsed — jsonb, not a JSON string", () => {
    for (const { row } of cases) {
      expect(Array.isArray(row.ingredients)).toBe(true);
      expect(rowToCustomMeal(row).ingredients).toEqual(row.ingredients);
    }
  });
});

describe("custom_foods → CustomFood (real rows)", () => {
  const cases = customFoodFixture.rows as {
    row: CustomFoodRow;
    expected: Record<string, unknown>;
  }[];

  it.each(cases)("$row.name", ({ row, expected }) => {
    expect(rowToCustomFood(row)).toEqual(expected);
  });

  it("renames per_unit → perUnit, default_qty → defaultQty, unit_label → unitLabel", () => {
    const perUnitCase = cases.find((c) => c.row.per_unit !== null)!;
    const mapped = rowToCustomFood(perUnitCase.row);

    expect(mapped.perUnit).toEqual(perUnitCase.row.per_unit);
    expect(mapped.defaultQty).toBe(Number(perUnitCase.row.default_qty));
    expect(mapped.unitLabel).toBe(perUnitCase.row.unit_label);
    expect(mapped).not.toHaveProperty("per_unit");
    expect(mapped).not.toHaveProperty("default_qty");
    expect(mapped).not.toHaveProperty("unit_label");
  });

  it("OMITS an absent basis rather than setting it null", () => {
    const per100Case = cases.find((c) => c.row.per100 !== null)!;
    const mapped = rowToCustomFood(per100Case.row);
    expect(mapped).toHaveProperty("per100");
    expect(mapped).not.toHaveProperty("perUnit");
  });

  it("per100 and perUnit are mutually exclusive across every real row", () => {
    for (const { row } of cases) {
      expect(Boolean(row.per100) !== Boolean(row.per_unit)).toBe(true);
    }
  });

  it("defaults defaultQty by unit when the column is null", () => {
    const base = cases[0].row;
    expect(rowToCustomFood({ ...base, unit: "g", default_qty: null }).defaultQty).toBe(100);
    expect(rowToCustomFood({ ...base, unit: "ml", default_qty: null }).defaultQty).toBe(100);
    expect(rowToCustomFood({ ...base, unit: "slice", default_qty: null }).defaultQty).toBe(1);
  });

  it("accepts the open unit strings really in the table", () => {
    const units = cases.map((c) => rowToCustomFood(c.row).unit);
    expect(units).toContain("2 biscuits");
    expect(units).toContain("pops");
  });
});

describe("macrosForQuantity against STORED rows — the Phase 1 gap, closed", () => {
  /**
   * PHASE-1-DECISIONS §5 left `macrosForQuantity` oracled against FOOD_DB literals
   * only, because no `custom_foods` rows had been exported. These 77 cases are real
   * stored rows × real quantities, with `expected` from the old app's `foodMacros`
   * (900–919) transcribed independently.
   */
  const cases = customFoodFixture.macrosForQuantity as {
    name: string;
    unit: string;
    basis: string;
    qty: number;
    expected: { kcal: number; pro: number; carb: number; fat: number };
  }[];

  const foods = new Map(
    (customFoodFixture.rows as { row: CustomFoodRow }[]).map((c) => [
      c.row.name,
      rowToCustomFood(c.row),
    ]),
  );

  it.each(cases)("$name × $qty $unit ($basis)", ({ name, qty, expected }) => {
    expect(macrosForQuantity(foods.get(name)!, qty)).toEqual(expected);
  });

  it("covers both bases", () => {
    expect(cases.some((c) => c.basis === "per100")).toBe(true);
    expect(cases.some((c) => c.basis === "perUnit")).toBe(true);
  });
});

describe("write mappers", () => {
  it("loggedMealToInsert stringifies ings and passes sortOrder straight through", () => {
    const insert = loggedMealToInsert(
      "2026-06-01",
      {
        name: "Test",
        kcal: 100,
        pro: 1,
        carb: 2,
        fat: 3,
        time: "7:30",
        _libId: "English Brekkie",
        _ings: [{ name: "Egg", qty: "2", kcal: 100, pro: 1, carb: 2, fat: 3 }],
      },
      5,
    );

    expect(insert.sort_order).toBe(5);
    expect(insert.logged_time).toBe("7:30");
    expect(insert.lib_id).toBe("English Brekkie");
    expect(typeof insert.ings_json).toBe("string");
    expect(JSON.parse(insert.ings_json!)[0].name).toBe("Egg");
  });

  it("loggedMealToInsert writes null ings_json when there are no ingredients", () => {
    const insert = loggedMealToInsert(
      "2026-06-01",
      { name: "T", kcal: 1, pro: 0, carb: 0, fat: 0, time: "", _libId: null, _ings: null },
      1,
    );
    expect(insert.ings_json).toBeNull();
    expect(insert.lib_id).toBeNull();
  });

  it("customFoodToUpsert writes an absent basis as explicit null", () => {
    const row = customFoodToUpsert({
      name: "Test",
      cat: "Other",
      unit: "g",
      defaultQty: 100,
      per100: { kcal: 85, pro: 5, carb: 15, fat: 0.5 },
      barcode: null,
    });
    // Explicit null, NOT undefined — an undefined would leave a stale value in
    // place on an upsert (old app 2114–2116).
    expect(row.per_unit).toBeNull();
    expect(row.unit_label).toBeNull();
    expect(row.per100).not.toBeNull();
  });

  it("customMealToUpsert defaults note and ingredients", () => {
    const row = customMealToUpsert({
      name: "M",
      cat: "Supper",
      note: "",
      kcal: 1,
      pro: 0,
      carb: 0,
      fat: 0,
      ingredients: [],
    });
    expect(row.note).toBe("");
    expect(row.ingredients).toEqual([]);
  });

  it("customFoodConflictTarget picks barcode when present, else name", () => {
    expect(customFoodConflictTarget({ barcode: "6001087001234" })).toBe("barcode");
    expect(customFoodConflictTarget({ barcode: null })).toBe("name");
  });
});

describe("isoDay", () => {
  it("passes a bare date through unchanged — the real shape", () => {
    expect(isoDay("2026-06-01")).toBe("2026-06-01");
  });

  it("still truncates a timestamp, should the column type ever change", () => {
    expect(isoDay("2026-06-01T00:00:00+00:00")).toBe("2026-06-01");
  });
});
