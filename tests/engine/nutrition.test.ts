import { describe, expect, it } from "vitest";

import {
  ATWATER_TOLERANCE,
  LABEL_KCAL_MAX,
  LABEL_MACRO_MAX,
  atwaterCheck,
  clampLabelMacros,
  clampLabelValue,
  kJtoKcal,
  per100gToPerServing,
  perServingToPer100g,
} from "../../lib/engine/nutrition";

/**
 * Oracle for the label-arithmetic trio (Migration Plan §6).
 *
 * Inputs are real SA label figures and real Open Food Facts payload shapes; each
 * case is input → expected output, self-contained. These are the functions the
 * model is FORBIDDEN from performing: `/api/ocr-label` transcribes printed digits
 * and units, and every number below is computed here.
 */

describe("kJtoKcal", () => {
  it("divides by 4.184", () => {
    // A real SA label: 1560 kJ per 100 g.
    expect(kJtoKcal(1560)).toBeCloseTo(372.849, 3);
    expect(kJtoKcal(2000)).toBeCloseTo(478.011, 2);
  });

  it("returns full precision, leaving rounding to the caller", () => {
    // The old app rounds only when filling a form box (round1, line 1577).
    expect(kJtoKcal(1560)).not.toBe(372.8);
    expect(kJtoKcal(1560).toString()).toContain(".");
  });

  it("handles zero", () => {
    expect(kJtoKcal(0)).toBe(0);
  });

  it("is the same conversion the Open Food Facts path uses", () => {
    // OFF gives energy_100g in kJ when energy-kcal_100g is absent (line 1453).
    const energy100g = 1560;
    expect(kJtoKcal(energy100g)).toBe(energy100g / 4.184);
  });
});

describe("perServingToPer100g — canonical storage is per-100g", () => {
  it("scales a per-serving figure up to per-100g", () => {
    // 40 g serving printing 12 g protein → 30 g per 100 g.
    expect(perServingToPer100g(12, 40)).toBe(30);
  });

  it("scales down when a serving is larger than 100 g", () => {
    expect(perServingToPer100g(25, 250)).toBe(10);
  });

  it("handles the awkward serving sizes real labels print", () => {
    expect(perServingToPer100g(5.4, 45)).toBeCloseTo(12, 10);
    expect(perServingToPer100g(8.3, 33)).toBeCloseTo(25.1515, 4);
  });

  it("is a no-op at a 100 g serving", () => {
    expect(perServingToPer100g(23.7, 100)).toBe(23.7);
  });

  it("returns unrounded values — the Save path decides precision", () => {
    // Old app rounds to 2 dp at the call site (line 1796), not in the conversion.
    expect(perServingToPer100g(1, 3)).toBeCloseTo(33.3333, 4);
    expect(perServingToPer100g(1, 3)).not.toBe(33.33);
  });

  it("rejects a serving size that cannot scale", () => {
    expect(() => perServingToPer100g(12, 0)).toThrow(RangeError);
    expect(() => perServingToPer100g(12, -40)).toThrow(RangeError);
    expect(() => perServingToPer100g(12, Number.NaN)).toThrow(RangeError);
  });
});

describe("per100gToPerServing — the inverse view", () => {
  it("expresses a per-100g figure for one serving", () => {
    expect(per100gToPerServing(30, 40)).toBe(12);
  });

  it("rejects a serving size that cannot scale", () => {
    expect(() => per100gToPerServing(30, 0)).toThrow(RangeError);
    expect(() => per100gToPerServing(30, -40)).toThrow(RangeError);
    expect(() => per100gToPerServing(30, Number.NaN)).toThrow(RangeError);
  });

  it("round-trips with perServingToPer100g", () => {
    const perServing = 8.3;
    const servingG = 33;
    expect(
      per100gToPerServing(perServingToPer100g(perServing, servingG), servingG),
    ).toBeCloseTo(perServing, 10);
  });
});

describe("clampLabelValue — drop wild reads rather than pre-fill nonsense", () => {
  it("keeps values inside the range, inclusive of the ceiling", () => {
    expect(clampLabelValue(380, LABEL_KCAL_MAX)).toBe(380);
    expect(clampLabelValue(LABEL_KCAL_MAX, LABEL_KCAL_MAX)).toBe(902);
    expect(clampLabelValue(0, LABEL_MACRO_MAX)).toBe(0);
    expect(clampLabelValue(100, LABEL_MACRO_MAX)).toBe(100);
  });

  it("drops values above the ceiling", () => {
    // 1560 is the kJ figure mistakenly read as kcal — impossible per 100 g.
    expect(clampLabelValue(1560, LABEL_KCAL_MAX)).toBeNull();
    expect(clampLabelValue(100.1, LABEL_MACRO_MAX)).toBeNull();
  });

  it("drops negatives and non-numbers", () => {
    expect(clampLabelValue(-1, LABEL_MACRO_MAX)).toBeNull();
    expect(clampLabelValue(Number.NaN, LABEL_MACRO_MAX)).toBeNull();
    expect(clampLabelValue(Number.POSITIVE_INFINITY, LABEL_KCAL_MAX)).toBeNull();
    expect(clampLabelValue(null, LABEL_MACRO_MAX)).toBeNull();
    expect(clampLabelValue(undefined, LABEL_MACRO_MAX)).toBeNull();
  });
});

describe("clampLabelMacros", () => {
  it("applies each ceiling to its own field", () => {
    expect(
      clampLabelMacros({ kcal: 380, pro: 12.5, carb: 67.5, fat: 6.25 }),
    ).toEqual({ kcal: 380, pro: 12.5, carb: 67.5, fat: 6.25 });
  });

  it("nulls only the fields that fail, leaving a partial read usable", () => {
    expect(clampLabelMacros({ kcal: 5000, pro: 12.5, carb: null, fat: 6.25 })).toEqual(
      { kcal: null, pro: 12.5, carb: null, fat: 6.25 },
    );
  });

  it("allows 902 kcal — pure fat is 900", () => {
    expect(clampLabelMacros({ kcal: 900, pro: 0, carb: 0, fat: 100 }).kcal).toBe(
      900,
    );
  });
});

describe("atwaterCheck — CODE decides plausibility, never the model", () => {
  it("passes a self-consistent label", () => {
    // 25 p + 5 c + 30 f → 4(25) + 4(5) + 9(30) = 390 kcal, label says 390.
    const result = atwaterCheck(390, 25, 5, 30);
    expect(result.checked).toBe(true);
    if (!result.checked) return;
    expect(result.estimatedKcal).toBe(390);
    expect(result.deviation).toBe(0);
    expect(result.plausible).toBe(true);
  });

  it("catches the kJ/kcal mix-up it exists for", () => {
    // The label's 1560 kJ transcribed as if it were kcal. Macros reconstruct to
    // ~373 kcal — a 76% gap. This is the read the amber warning fires on.
    const result = atwaterCheck(1560, 12.5, 67.5, 6.25);
    expect(result.checked).toBe(true);
    if (!result.checked) return;
    expect(result.estimatedKcal).toBeCloseTo(376.25, 2);
    expect(result.deviation).toBeGreaterThan(0.2);
    expect(result.plausible).toBe(false);
  });

  it("tolerates ordinary label rounding", () => {
    // Real labels rarely reconcile exactly; 380 vs 376.25 is a 1% gap, fine.
    const result = atwaterCheck(380, 12.5, 67.5, 6.25);
    expect(result.checked && result.plausible).toBe(true);
  });

  it("treats exactly the tolerance as plausible", () => {
    // Old app warns on `> 0.20`, so a dead-on 20% deviation does NOT warn.
    const result = atwaterCheck(100, 30, 0, 0);
    expect(result.checked).toBe(true);
    if (!result.checked) return;
    expect(result.deviation).toBeCloseTo(ATWATER_TOLERANCE, 10);
    expect(result.plausible).toBe(true);
  });

  it("declines to judge a partial read rather than crying wolf", () => {
    expect(atwaterCheck(380, null, 67.5, 6.25)).toEqual({
      checked: false,
      reason: "incomplete",
    });
    expect(atwaterCheck(null, 12.5, 67.5, 6.25)).toEqual({
      checked: false,
      reason: "incomplete",
    });
  });

  it("declines on a zero-calorie product", () => {
    // Creatine: 0/0/0/0 is not implausible, it is just zero.
    expect(atwaterCheck(0, 0, 0, 0)).toEqual({
      checked: false,
      reason: "non-positive",
    });
  });

  it("accepts a custom tolerance", () => {
    const strict = atwaterCheck(380, 12.5, 67.5, 6.25, 0.005);
    expect(strict.checked && strict.plausible).toBe(false);
  });
});

describe("the OCR pipeline order (Plan §6, old app lines 1556–1592)", () => {
  it("converts, normalises, clamps, THEN checks", () => {
    // A per-serving-only label: 45 g serving, 700 kJ, 5.4 p / 22 c / 4 f.
    // Every step below is code. The model supplied only the printed digits.
    const servingG = 45;
    const kcalPerServing = kJtoKcal(700);

    const per100 = clampLabelMacros({
      kcal: perServingToPer100g(kcalPerServing, servingG),
      pro: perServingToPer100g(5.4, servingG),
      carb: perServingToPer100g(22, servingG),
      fat: perServingToPer100g(4, servingG),
    });

    expect(per100.kcal).toBeCloseTo(371.787, 3);
    expect(per100.pro).toBeCloseTo(12, 10);
    expect(per100.carb).toBeCloseTo(48.889, 3);
    expect(per100.fat).toBeCloseTo(8.889, 3);

    const verdict = atwaterCheck(
      per100.kcal,
      per100.pro,
      per100.carb,
      per100.fat,
    );
    expect(verdict.checked && verdict.plausible).toBe(true);
  });
});
