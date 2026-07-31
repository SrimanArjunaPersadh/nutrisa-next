import { describe, expect, it } from "vitest";

import { isGramUnit, macrosForQuantity } from "../../lib/engine/macros";
import type { Food } from "../../lib/engine/types";

/**
 * Oracle for `macrosForQuantity` (Migration Plan §6).
 *
 * Fixtures are real `FOOD_DB` rows lifted verbatim from the old app
 * (`docs/reference/old-index.html` lines 823–896). They are the same objects
 * `foodMacros()` has been running against in production, so input → expected
 * output is self-contained: no DB export needed to make this an honest oracle.
 * The `custom_meals` export is still outstanding and will extend, not replace,
 * these cases.
 */

const ROLLED_OATS: Food = {
  unit: "g",
  per100: { kcal: 380, pro: 12.5, carb: 67.5, fat: 6.25 },
};

const LOW_FAT_MILK: Food = {
  unit: "ml",
  per100: { kcal: 47, pro: 3.2, carb: 4.8, fat: 1 },
};

const SOURDOUGH_SLICE: Food = {
  unit: "slice",
  perUnit: { kcal: 90, pro: 3.4, carb: 17, fat: 0.55 },
};

const PEANUT_BUTTER_TBSP: Food = {
  unit: "tbsp",
  perUnit: { kcal: 94, pro: 4, carb: 3.2, fat: 8 },
};

const WHEY_SCOOP: Food = {
  unit: "scoop",
  perUnit: { kcal: 132, pro: 27, carb: 2, fat: 1.4 },
};

const CREATINE: Food = {
  unit: "g",
  per100: { kcal: 0, pro: 0, carb: 0, fat: 0 },
};

describe("isGramUnit", () => {
  it("is true for the two weight/volume units and nothing else", () => {
    expect(isGramUnit({ unit: "g" })).toBe(true);
    expect(isGramUnit({ unit: "ml" })).toBe(true);
    expect(isGramUnit({ unit: "slice" })).toBe(false);
    expect(isGramUnit({ unit: "scoop" })).toBe(false);
    expect(isGramUnit({ unit: "biscuit" })).toBe(false);
    expect(isGramUnit({ unit: "pinch" })).toBe(false);
  });
});

describe("macrosForQuantity — per-100 foods", () => {
  it("scales grams by qty/100", () => {
    expect(macrosForQuantity(ROLLED_OATS, 80)).toEqual({
      kcal: 304,
      pro: 10,
      carb: 54,
      fat: 5,
    });
  });

  it("treats ml on the per-100 path, same as grams", () => {
    // 250 ml of milk: 47 × 2.5 = 117.5 kcal, rounded to a whole number.
    expect(macrosForQuantity(LOW_FAT_MILK, 250)).toEqual({
      kcal: 118,
      pro: 8,
      carb: 12,
      fat: 2.5,
    });
  });

  it("returns the per-100 values unchanged at qty 100", () => {
    expect(macrosForQuantity(ROLLED_OATS, 100)).toEqual({
      kcal: 380,
      pro: 12.5,
      carb: 67.5,
      fat: 6.3, // 6.25 → 1 dp, the value the old app stores
    });
  });

  it("handles a zero-calorie food without inventing anything", () => {
    expect(macrosForQuantity(CREATINE, 5)).toEqual({
      kcal: 0,
      pro: 0,
      carb: 0,
      fat: 0,
    });
  });
});

describe("macrosForQuantity — per-unit foods", () => {
  it("multiplies by whole units", () => {
    expect(macrosForQuantity(SOURDOUGH_SLICE, 2)).toEqual({
      kcal: 180,
      pro: 6.8,
      carb: 34,
      fat: 1.1,
    });
  });

  it("multiplies by fractional units (tbsp/tsp step 0.5)", () => {
    expect(macrosForQuantity(PEANUT_BUTTER_TBSP, 0.5)).toEqual({
      kcal: 47,
      pro: 2,
      carb: 1.6,
      fat: 4,
    });
  });

  it("does not divide per-unit foods by 100", () => {
    // The bug this guards: reading a per-unit food down the per-100 path would
    // give 1.32 kcal for a scoop of whey instead of 132.
    expect(macrosForQuantity(WHEY_SCOOP, 1).kcal).toBe(132);
  });
});

describe("macrosForQuantity — rounding is stored, not cosmetic", () => {
  it("rounds kcal to a whole number and macros to 1 dp", () => {
    // These rounded figures are what gets written to meal_logs and rolled up
    // into day totals, so the rounding belongs in the engine, not the view.
    const result = macrosForQuantity(ROLLED_OATS, 37);
    expect(result.kcal).toBe(141); // 140.6 → 141
    expect(result.pro).toBe(4.6); // 4.625 → 4.6
    expect(result.fat).toBe(2.3); // 2.3125 → 2.3
    expect(Number.isInteger(result.kcal)).toBe(true);
  });
});

describe("macrosForQuantity — boundaries", () => {
  it("returns zeros at qty 0", () => {
    expect(macrosForQuantity(ROLLED_OATS, 0)).toEqual({
      kcal: 0,
      pro: 0,
      carb: 0,
      fat: 0,
    });
    expect(macrosForQuantity(SOURDOUGH_SLICE, 0)).toEqual({
      kcal: 0,
      pro: 0,
      carb: 0,
      fat: 0,
    });
  });

  it("passes negative quantities straight through, unguarded, like the old app", () => {
    // No clamp exists upstream in the old app either; the gram editor's min is a
    // UI affordance, not an engine rule. Documented so it is a decision, not a
    // surprise, if a caller ever hands us one.
    expect(macrosForQuantity(SOURDOUGH_SLICE, -1).kcal).toBe(-90);
  });

  it("throws when a food lacks the basis its unit requires", () => {
    expect(() => macrosForQuantity({ unit: "g" }, 100)).toThrow(/per100/);
    expect(() => macrosForQuantity({ unit: "slice" }, 1)).toThrow(/perUnit/);
  });
});
