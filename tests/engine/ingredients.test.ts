import { describe, expect, it } from "vitest";

import type { StoredIngredient } from "@/lib/data";
import {
  baseQty,
  scaleIngredient,
  scaleIngredients,
  sumIngredients,
  toStoredIngredients,
} from "@/lib/engine/ingredients";
import fixture from "../fixtures/meal_logs.json";

/**
 * The gram editor's arithmetic against real stored ingredients (Plan §6).
 *
 * These figures get written BACK to `meal_logs`, so they are stored values and
 * the old app's rounding is the oracle. The running 1 dp accumulate in
 * `sumIngredients` is the quirk most likely to be "tidied" by someone who has
 * not read this file — it is pinned below.
 */

type FixtureRow = {
  expected: { name: string; _ings: StoredIngredient[] | null };
};

const ROWS = (fixture as { rows: FixtureRow[] }).rows;

/** The real 3-ingredient breakfast: Coco Pops 30, milk 250, whey 0.5 scoop. */
const BREKKIE = ROWS.find(
  (r) => r.expected.name === "Kellogg's 30g, Clover 250ml, Peanut 0.5scoop",
)!.expected._ings!;

describe("baseQty — the quantity the stored macros describe", () => {
  it("reads a bare meal_logs quantity", () => {
    expect(baseQty({ qty: "80" })).toBe(80);
  });

  it("reads a suffixed custom_meals quantity", () => {
    // "133g" → 133. One function, both of the app's two conventions.
    expect(baseQty({ qty: "133g" })).toBe(133);
  });

  it("reads a fractional quantity", () => {
    expect(baseQty({ qty: "0.5" })).toBe(0.5);
  });

  it("falls back to 100 on an unparseable quantity — the old app's quirk", () => {
    expect(baseQty({ qty: "" })).toBe(100);
    expect(baseQty({ qty: "a lot" })).toBe(100);
  });

  it("turns a genuine zero into 100, because `|| 100` cannot tell them apart", () => {
    // Carried forward deliberately: every stored row was written against this.
    expect(baseQty({ qty: "0" })).toBe(100);
  });
});

describe("scaleIngredient — pure proportion, no food lookup", () => {
  const milk = BREKKIE[1]; // Clover Low Fat Milk, 250 → 118 kcal, 8 P, 12 C, 2.5 F

  it("leaves an ingredient alone at its stored quantity", () => {
    expect(scaleIngredient(milk, 250)).toEqual({
      name: milk.name,
      qty: 250,
      kcal: 118,
      pro: 8,
      carb: 12,
      fat: 2.5,
    });
  });

  it("halves cleanly", () => {
    const half = scaleIngredient(milk, 125);
    expect(half).toEqual({
      name: milk.name,
      qty: 125,
      kcal: 59,
      pro: 4,
      carb: 6,
      fat: 1.3, // 1.25 → toFixed(1) rounds half away from zero
    });
  });

  it("rounds kcal with Math.round and the macros with toFixed(1)", () => {
    // 250 → 175 is ×0.7: kcal 82.6 → 83, protein 5.6, carbs 8.4, fat 1.75 → 1.8.
    expect(scaleIngredient(milk, 175)).toMatchObject({
      kcal: 83,
      pro: 5.6,
      carb: 8.4,
      fat: 1.8,
    });
  });

  it("scales a fractional base quantity", () => {
    const whey = BREKKIE[2]; // 0.5 scoop → 66 kcal, 13.5 P
    expect(scaleIngredient(whey, 1)).toMatchObject({ kcal: 132, pro: 27 });
  });

  it("yields zeros rather than Infinity when the base is zero", () => {
    // baseQty's `|| 100` means a "0" string never reaches this, but a stored
    // quantity of "0g" with a leading zero could. `bg > 0 ? cg/bg : 0` (633).
    const zero: StoredIngredient = {
      name: "x",
      qty: "0",
      kcal: 100,
      pro: 1,
      carb: 1,
      fat: 1,
    };
    // qty "0" → baseQty 100, so this is really ×0 of the quantity, not of the base.
    expect(scaleIngredient(zero, 0)).toMatchObject({ kcal: 0, pro: 0 });
  });
});

describe("scaleIngredients — sparse overrides", () => {
  it("leaves untouched ingredients at their stored quantity", () => {
    const scaled = scaleIngredients(BREKKIE, [undefined, 125, undefined]);

    expect(scaled[0].qty).toBe(30);
    expect(scaled[1].qty).toBe(125);
    expect(scaled[2].qty).toBe(0.5);
  });

  it("reproduces the stored macros when nothing is overridden", () => {
    const scaled = scaleIngredients(BREKKIE);

    expect(scaled.map((i) => i.kcal)).toEqual(BREKKIE.map((i) => i.kcal));
    expect(scaled.map((i) => i.pro)).toEqual(BREKKIE.map((i) => i.pro));
  });
});

describe("sumIngredients — the running 1 dp accumulate", () => {
  it("totals the real breakfast to its stored meal figures", () => {
    // The meal_logs row says 288 kcal / 23.6 P / 36 C / 3.7 F. The ingredients
    // must reconstruct it — that IS the oracle for this function.
    expect(sumIngredients(scaleIngredients(BREKKIE))).toEqual({
      kcal: 288,
      pro: 23.6,
      carb: 36,
      fat: 3.7,
    });
  });

  it("rounds at EVERY step and feeds the rounded value forward", () => {
    // Three ingredients at 0.05 g of protein each. Rounding once at the end
    // gives 0.15 → 0.2. The old app rounds each step: 0 + 0.05 = 0.1, then
    // 0.1 + 0.05 = 0.2, then 0.2 + 0.05 = 0.3. Different algorithm, and this is
    // the one that produced every stored value.
    const ings = [0.05, 0.05, 0.05].map((pro, i) => ({
      name: `i${i}`,
      qty: 1,
      kcal: 0,
      pro,
      carb: 0,
      fat: 0,
    }));

    expect(sumIngredients(ings).pro).toBe(0.3);
    expect(+(0.05 + 0.05 + 0.05).toFixed(1)).toBe(0.2); // the tidy version
  });

  it("is zero for no ingredients", () => {
    expect(sumIngredients([])).toEqual({ kcal: 0, pro: 0, carb: 0, fat: 0 });
  });
});

describe("toStoredIngredients — the edit becomes the new baseline", () => {
  it("stores the current quantity as a bare number string", () => {
    const scaled = scaleIngredients(BREKKIE, [undefined, 125, undefined]);
    const stored = toStoredIngredients(scaled);

    expect(stored[1].qty).toBe("125");
    expect(stored[1].kcal).toBe(59);
  });

  it("round-trips to ratio 1, so a second edit scales from the first", () => {
    const once = toStoredIngredients(
      scaleIngredients(BREKKIE, [undefined, 125, undefined]),
    );
    // Re-scaling the stored result at its own quantity must be a no-op.
    const twice = scaleIngredients(once);

    expect(twice.map((i) => i.kcal)).toEqual(once.map((i) => i.kcal));
    expect(sumIngredients(twice)).toEqual(sumIngredients(scaleIngredients(once)));
  });
});
