import { describe, expect, it } from "vitest";

import { FOOD_DB } from "@/lib/food-db";
import { unitDisplayLabel, unitMin, unitStep } from "@/lib/units";

/**
 * Ports `unitDisplayLabel` (911), `unitStep` (919) and `unitMin` (924).
 *
 * These decide what a quantity input looks like and how its stepper moves, which
 * is why eng review D5 exists: the saved-meal editor hardcoded `step="5"`, so a
 * steak stepped 1 → 5 → 10. Anything with a quantity input asks these.
 */

describe("unitDisplayLabel", () => {
  it("shows the bare unit for grams and millilitres, whatever the quantity", () => {
    expect(unitDisplayLabel({ unit: "g" }, 1)).toBe("g");
    expect(unitDisplayLabel({ unit: "g" }, 150)).toBe("g");
    expect(unitDisplayLabel({ unit: "ml" }, 1)).toBe("ml");
    expect(unitDisplayLabel({ unit: "ml" }, 250)).toBe("ml");
  });

  it("keeps a countable unit singular at exactly 1", () => {
    expect(unitDisplayLabel({ unit: "slice" }, 1)).toBe("slice");
    expect(unitDisplayLabel({ unit: "steak" }, 1)).toBe("steak");
    expect(unitDisplayLabel({ unit: "scoop" }, 1)).toBe("scoop");
  });

  it("pluralises a countable unit at any quantity that is not 1", () => {
    expect(unitDisplayLabel({ unit: "slice" }, 2)).toBe("slices");
    expect(unitDisplayLabel({ unit: "piece" }, 3)).toBe("pieces");
    expect(unitDisplayLabel({ unit: "steak" }, 2)).toBe("steaks");
    expect(unitDisplayLabel({ unit: "spray" }, 3)).toBe("sprays");
  });

  it("pluralises 0 and fractions too — `qty === 1` is the whole rule", () => {
    expect(unitDisplayLabel({ unit: "slice" }, 0)).toBe("slices");
    expect(unitDisplayLabel({ unit: "slice" }, 1.5)).toBe("slices");
    expect(unitDisplayLabel({ unit: "slice" }, 0.5)).toBe("slices");
  });

  it("leaves the units that do not pluralise alone", () => {
    expect(unitDisplayLabel({ unit: "tbsp" }, 2)).toBe("tbsp");
    expect(unitDisplayLabel({ unit: "tsp" }, 3)).toBe("tsp");
    expect(unitDisplayLabel({ unit: "pinch" }, 2)).toBe("pinch");
  });

  it("carries the plurals map's GAPS forward — 'sausage' and 'biscuit'", () => {
    // Both are real FOOD_DB units and neither is in the old app's plurals map,
    // so both render un-pluralised. Pinned so nobody "completes" the map and
    // quietly changes text the app has always shown.
    expect(unitDisplayLabel({ unit: "sausage" }, 2)).toBe("sausage");
    expect(unitDisplayLabel({ unit: "biscuit" }, 3)).toBe("biscuit");
  });

  it("falls through for a unit the user invented", () => {
    // `unitType` is an OPEN string — users type their own unit names.
    expect(unitDisplayLabel({ unit: "handful" }, 1)).toBe("handful");
    expect(unitDisplayLabel({ unit: "handful" }, 4)).toBe("handful");
  });
});

describe("unitStep", () => {
  it("steps grams by 5 and millilitres by 10", () => {
    expect(unitStep({ unit: "g" })).toBe(5);
    expect(unitStep({ unit: "ml" })).toBe(10);
  });

  it("steps spoons by a half", () => {
    expect(unitStep({ unit: "tbsp" })).toBe(0.5);
    expect(unitStep({ unit: "tsp" })).toBe(0.5);
  });

  it("steps anything countable by 1", () => {
    // The D5 case: a steak must not step 1 → 5 → 10.
    expect(unitStep({ unit: "steak" })).toBe(1);
    expect(unitStep({ unit: "slice" })).toBe(1);
    expect(unitStep({ unit: "scoop" })).toBe(1);
    expect(unitStep({ unit: "piece" })).toBe(1);
    expect(unitStep({ unit: "pinch" })).toBe(1);
    expect(unitStep({ unit: "handful" })).toBe(1);
  });

  it("gives every FOOD_DB unit a step greater than zero", () => {
    // A step of 0 makes a number input reject every arrow press.
    for (const food of FOOD_DB) {
      expect(unitStep(food), `${food.name} (${food.unit})`).toBeGreaterThan(0);
    }
  });
});

describe("unitMin", () => {
  it("is always 0", () => {
    // The composer lets a row sit at 0 while you decide; `mbSave` warns about
    // 0-quantity rows rather than preventing them.
    expect(unitMin()).toBe(0);
  });
});
