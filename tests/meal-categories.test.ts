import { describe, expect, it } from "vitest";

import type { CustomMeal } from "@/lib/data";
import { CATS, UNCATEGORISED, groupByCategory } from "@/lib/meal-categories";
import fixture from "./fixtures/custom_meals.json";

/**
 * The Saved Meals grouping (PHASE-4-DECISIONS §4a).
 *
 * The case worth pinning is the one the fixture does NOT contain: a saved meal
 * with no category. The old app dropped those on the floor, and the mapper can
 * produce one from any row whose `cat` is null.
 */

const meal = (name: string, cat: string): CustomMeal => ({
  _id: name,
  id: name,
  name,
  cat,
  note: "",
  kcal: 500,
  pro: 30,
  carb: 50,
  fat: 15,
  ingredients: [],
});

describe("groupByCategory", () => {
  it("groups the real fixture meals under their categories", () => {
    const rows = (fixture as { rows: { expected: CustomMeal }[] }).rows.map(
      (r) => r.expected,
    );
    const groups = groupByCategory(rows);

    // Two Breakfast meals, one Supper, one Pre-Workout — and no Lunch, which
    // must therefore not appear at all.
    expect(groups.map((g) => g.cat)).toEqual([
      "Breakfast",
      "Supper",
      "Pre-Workout",
    ]);
    expect(groups[0].meals.map((m) => m.name)).toEqual([
      "English Brekkie",
      "Greek Yoghurt Fruit Bowl",
    ]);
  });

  it("keeps the old app's category order, not the data's", () => {
    const groups = groupByCategory([
      meal("a", "Pre-Workout"),
      meal("b", "Breakfast"),
      meal("c", "Supper"),
      meal("d", "Lunch"),
    ]);

    expect(groups.map((g) => g.cat)).toEqual([...CATS]);
  });

  it("omits a category with nothing in it", () => {
    const groups = groupByCategory([meal("a", "Lunch")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].cat).toBe("Lunch");
  });

  it("rescues a meal with no category — THE DIVERGENCE", () => {
    // The old app's `CATS.map(cat => meals.filter(m => m.cat === cat))` drops
    // this row entirely: it exists in custom_meals and can be reached from no
    // screen. rowToCustomMeal maps a null `cat` to "" (mappers.ts:166), so a
    // real row can be exactly this.
    const groups = groupByCategory([meal("a", "Breakfast"), meal("orphan", "")]);

    expect(groups.map((g) => g.cat)).toEqual(["Breakfast", UNCATEGORISED]);
    expect(groups[1].meals.map((m) => m.name)).toEqual(["orphan"]);
  });

  it("rescues a category the app has never heard of", () => {
    const groups = groupByCategory([meal("a", "Midnight Snack")]);

    expect(groups).toHaveLength(1);
    expect(groups[0].cat).toBe(UNCATEGORISED);
    expect(groups[0].meals[0].name).toBe("a");
  });

  it("puts strays last, after every known category", () => {
    const groups = groupByCategory([meal("orphan", ""), meal("a", "Supper")]);
    expect(groups.map((g) => g.cat)).toEqual(["Supper", UNCATEGORISED]);
  });

  it("has nothing to group when there are no saved meals", () => {
    expect(groupByCategory([])).toEqual([]);
  });
});
