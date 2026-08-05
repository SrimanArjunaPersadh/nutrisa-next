import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  FLAGGED_FOODS,
  FOOD_CATS,
  FOOD_DB,
  isFlagged,
  type SearchableFood,
} from "@/lib/food-db";
import { isGramUnit } from "@/lib/engine/macros";

/**
 * THE ORACLE, APPLIED TO A CONSTANT.
 *
 * `FOOD_DB` is 74 hand-transcribed foods, each carrying four macros. A single
 * mistyped digit is a wrong number in every meal ever built from that food, and
 * it would never surface as an error — just as slightly wrong totals. Plan §6's
 * rule is that a ported thing is WRONG until it reproduces the old app's value,
 * so this does not check the transcription by eye.
 *
 * It parses the `FOOD_DB` array literal straight out of
 * `docs/reference/old-index.html` — the read-only reference copy of the old app
 * that lives in this repo — and compares it to the ported module field by field.
 *
 * `new Function` is used to evaluate the extracted literal. That is acceptable
 * here and nowhere else: the input is a checked-in file under our control, this
 * is a Node-only test, and the alternative (a hand-written JS object parser) is
 * more code with more ways to be subtly wrong than the thing it verifies.
 */

const OLD_APP = fileURLToPath(
  new URL("../docs/reference/old-index.html", import.meta.url),
);

/** The old app's FOOD_DB, evaluated out of the reference file. */
function oldFoodDb(): SearchableFood[] {
  const source = readFileSync(OLD_APP, "utf8");

  const start = source.indexOf("const FOOD_DB = [");
  expect(start, "FOOD_DB literal not found in old-index.html").toBeGreaterThan(-1);

  const open = source.indexOf("[", start);
  const close = source.indexOf("\n];", open);
  expect(close, "FOOD_DB terminator not found").toBeGreaterThan(open);

  const literal = source.slice(open, close + 2);
  return new Function(`return ${literal}`)() as SearchableFood[];
}

const OLD = oldFoodDb();

describe("FOOD_DB — transcription against the old app", () => {
  it("has the same number of entries", () => {
    // 74, not 80. An earlier draft of the Phase 5 design doc said 80; the
    // literal runs 823–896.
    expect(FOOD_DB).toHaveLength(OLD.length);
    expect(FOOD_DB).toHaveLength(74);
  });

  it("preserves the order exactly", () => {
    // Order decides which foods win a crowded query: the pool is
    // [...FOOD_DB, ...customFoods] and search returns the first 8 matches.
    expect(FOOD_DB.map((f) => f.name)).toEqual(OLD.map((f) => f.name));
  });

  it("reproduces every field of every food, byte for byte", () => {
    OLD.forEach((expected, i) => {
      const actual = FOOD_DB[i];

      expect(actual.name, `entry ${i} name`).toBe(expected.name);
      expect(actual.cat, `${expected.name} cat`).toBe(expected.cat);
      expect(actual.unit, `${expected.name} unit`).toBe(expected.unit);
      expect(actual.defaultQty, `${expected.name} defaultQty`).toBe(
        expected.defaultQty,
      );
      expect(actual.per100 ?? null, `${expected.name} per100`).toEqual(
        expected.per100 ?? null,
      );
      expect(actual.perUnit ?? null, `${expected.name} perUnit`).toEqual(
        expected.perUnit ?? null,
      );
      expect(actual.unitLabel ?? null, `${expected.name} unitLabel`).toBe(
        expected.unitLabel ?? null,
      );
    });
  });
});

describe("FOOD_DB — shape invariants", () => {
  it("gives every food exactly one macro basis, matching its unit", () => {
    // The invariant `macrosForQuantity` relies on: a g/ml food is read through
    // `per100`, everything else through `perUnit`. A food carrying the wrong
    // one throws a TypeError the moment it is used.
    for (const food of FOOD_DB) {
      if (isGramUnit(food)) {
        expect(food.per100, `${food.name} is ${food.unit}, needs per100`).toBeTruthy();
        expect(food.perUnit, `${food.name} should not carry perUnit`).toBeUndefined();
      } else {
        expect(food.perUnit, `${food.name} is ${food.unit}, needs perUnit`).toBeTruthy();
        expect(food.per100, `${food.name} should not carry per100`).toBeUndefined();
      }
    }
  });

  it("labels every per-unit food and no gram food", () => {
    for (const food of FOOD_DB) {
      if (isGramUnit(food)) {
        expect(food.unitLabel, `${food.name} is g/ml, needs no label`).toBeUndefined();
      } else {
        expect(food.unitLabel, `${food.name} needs a unitLabel`).toBeTruthy();
      }
    }
  });

  it("draws every category from FOOD_CATS", () => {
    const known = new Set<string>(FOOD_CATS);
    for (const food of FOOD_DB) {
      expect(known.has(food.cat), `${food.name} has cat "${food.cat}"`).toBe(true);
    }
  });

  it("has no duplicate names", () => {
    // Duplicates inside FOOD_DB would collide under the identity merge the
    // composer uses (built-ins have no `_id`, so they key on name).
    const names = FOOD_DB.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("never carries a negative macro", () => {
    for (const food of FOOD_DB) {
      const m = food.per100 ?? food.perUnit;
      expect(m).toBeTruthy();
      for (const [key, value] of Object.entries(m!)) {
        expect(value, `${food.name} ${key}`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("FOOD_CATS and FLAGGED_FOODS", () => {
  it("ports FOOD_CATS in the old app's order", () => {
    expect([...FOOD_CATS]).toEqual([
      "Protein",
      "Carb",
      "Dairy",
      "Vegetable",
      "Fruit",
      "Fat",
      "Supplement",
      "Legume",
      "Condiment",
      "Spice",
      "Other",
    ]);
  });

  it("flags exactly the two oils, with the old app's wording", () => {
    expect(Object.keys(FLAGGED_FOODS).sort()).toEqual(["Coconut Oil", "Olive Oil"]);
    expect(FLAGGED_FOODS["Olive Oil"]).toBe(
      "⚠️ Olive oil is off-plan. Use cooking spray only.",
    );
    expect(FLAGGED_FOODS["Coconut Oil"]).toBe(
      "⚠️ Coconut oil is off-plan. Use cooking spray only.",
    );
  });

  it("both flagged foods actually exist in FOOD_DB", () => {
    const names = new Set(FOOD_DB.map((f) => f.name));
    for (const flagged of Object.keys(FLAGGED_FOODS)) {
      expect(names.has(flagged), `${flagged} is flagged but not in FOOD_DB`).toBe(true);
    }
  });

  it("isFlagged does not answer yes to inherited Object properties", () => {
    // `FLAGGED_FOODS[name]` would be truthy for "constructor" or "toString".
    // A food genuinely named "constructor" is absurd; a food named "valueOf"
    // arriving from custom_foods is merely unlikely, and this costs nothing.
    expect(isFlagged("Olive Oil")).toBe(true);
    expect(isFlagged("Vejoy Tofu")).toBe(false);
    expect(isFlagged("constructor")).toBe(false);
    expect(isFlagged("toString")).toBe(false);
  });
});
