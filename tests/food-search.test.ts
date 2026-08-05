import { describe, expect, it } from "vitest";

import { FOOD_DB, type SearchableFood } from "@/lib/food-db";
import {
  SEARCH_LIMIT,
  foodIdentity,
  foodPool,
  isSameFood,
  isUsableFood,
  searchFoods,
  unusableFoods,
} from "@/lib/food-search";

/**
 * Ports `searchFoodDB` (old app 938–945), plus the two Phase 5 review rulings
 * that changed it: D7's usability filter and D6's identity-not-name matching.
 */

const custom = (over: Partial<SearchableFood> & { _id?: string } = {}) =>
  ({
    name: "Woolworths Pea Protein",
    cat: "Protein",
    unit: "g",
    defaultQty: 30,
    per100: { kcal: 380, pro: 80, carb: 4, fat: 5 },
    ...over,
  }) as SearchableFood & { _id?: string };

describe("searchFoods — the old app's matching, exactly", () => {
  it("returns nothing for an empty or whitespace-only query", () => {
    // The old app's `q.trim().length < 1` guard: the dropdown starts closed and
    // an emptied input closes it again.
    expect(searchFoods("", FOOD_DB)).toEqual([]);
    expect(searchFoods("   ", FOOD_DB)).toEqual([]);
    expect(searchFoods("\t\n", FOOD_DB)).toEqual([]);
  });

  it("matches on a single character — the old app's minimum is 1, not 2", () => {
    // The MEAL search needs 2 (doSearch, 750). This one needs 1. Different
    // widgets, different thresholds, both deliberate.
    expect(searchFoods("t", FOOD_DB).length).toBeGreaterThan(0);
  });

  it("matches a substring anywhere in the name, not just the start", () => {
    const names = searchFoods("yoghurt", FOOD_DB).map((f) => f.name);
    expect(names).toContain("Clover Greek Yoghurt");
  });

  it("is case-insensitive in both directions", () => {
    expect(searchFoods("VEJOY", FOOD_DB).map((f) => f.name)).toContain("Vejoy Tofu");
    expect(searchFoods("vejoy", FOOD_DB).map((f) => f.name)).toContain("Vejoy Tofu");
    expect(searchFoods("VeJoY", FOOD_DB).map((f) => f.name)).toContain("Vejoy Tofu");
  });

  it("trims the query before matching", () => {
    expect(searchFoods("  tofu  ", FOOD_DB).map((f) => f.name)).toContain("Vejoy Tofu");
  });

  it("caps at 8 results", () => {
    // "a" matches most of the database; the dropdown must stay a dropdown.
    const many = searchFoods("a", FOOD_DB);
    expect(many).toHaveLength(SEARCH_LIMIT);
    expect(SEARCH_LIMIT).toBe(8);
  });

  it("returns matches in pool order, not alphabetically or by relevance", () => {
    // Pool order decides which 8 a user can reach. The old app never re-sorts.
    const results = searchFoods("whey", FOOD_DB).map((f) => f.name);
    expect(results).toEqual([
      "Vanilla Whey Protein",
      "Choc Mint Whey Protein",
      "Peanut Butter Cup Whey Protein",
      "USN Hardcore Whey gH",
    ]);
  });

  it("returns nothing when nothing matches", () => {
    expect(searchFoods("zzzznotafood", FOOD_DB)).toEqual([]);
  });

  it("does not match on category", () => {
    // `searchFoodDB` never looks at `cat`. Searching "Protein" finds foods with
    // Protein in the NAME, and not the whole Protein category.
    const results = searchFoods("protein", FOOD_DB);
    expect(results.every((f) => f.name.toLowerCase().includes("protein"))).toBe(true);
  });
});

describe("foodPool — built-ins first, then custom", () => {
  it("puts FOOD_DB ahead of the user's foods", () => {
    const mine = custom({ name: "Aardvark Protein" });
    const pool = foodPool([mine]);

    expect(pool).toHaveLength(FOOD_DB.length + 1);
    expect(pool[0]).toBe(FOOD_DB[0]);
    expect(pool[pool.length - 1]).toBe(mine);
  });

  it("handles no custom foods at all", () => {
    expect(foodPool()).toHaveLength(FOOD_DB.length);
    expect(foodPool([])).toHaveLength(FOOD_DB.length);
  });

  it("finds a custom food through search once it is in the pool", () => {
    const mine = custom({ name: "Woolworths Pea Protein" });
    const names = searchFoods("woolworths", foodPool([mine])).map((f) => f.name);
    expect(names).toEqual(["Woolworths Pea Protein"]);
  });
});

describe("isUsableFood / unusableFoods — D7, the row that used to crash the app", () => {
  it("accepts a well-formed gram food and a well-formed per-unit food", () => {
    expect(isUsableFood(FOOD_DB.find((f) => f.unit === "g")!)).toBe(true);
    expect(isUsableFood(FOOD_DB.find((f) => f.unit === "scoop")!)).toBe(true);
  });

  it("rejects a gram food with no per100", () => {
    // `rowToCustomFood` attaches a basis only when the column is non-null, so
    // this row is producible from a half-written custom_foods row. Picking it
    // makes macrosForQuantity throw.
    const broken = custom({ per100: undefined });
    expect(isUsableFood(broken)).toBe(false);
  });

  it("rejects a per-unit food with no perUnit", () => {
    const broken = custom({ unit: "scoop", per100: undefined, perUnit: undefined });
    expect(isUsableFood(broken)).toBe(false);
  });

  it("rejects a food whose basis does not match its unit", () => {
    // The poisoned row the old app's cfSave gram-unit guard (1765) exists to
    // prevent: unit says grams, macros are per-unit. isGramUnit() is true, so
    // per100 is read, and it is not there.
    const mismatched = custom({
      unit: "g",
      per100: undefined,
      perUnit: { kcal: 100, pro: 10, carb: 5, fat: 2 },
    });
    expect(isUsableFood(mismatched)).toBe(false);
  });

  it("keeps unusable foods out of search results entirely", () => {
    const broken = custom({ name: "Broken Pea Protein", per100: undefined });
    const results = searchFoods("pea protein", foodPool([broken]));
    expect(results.map((f) => f.name)).not.toContain("Broken Pea Protein");
  });

  it("removes unusable foods BEFORE the cap, so they cost no slot", () => {
    // If filtering happened after slicing, a pool front-loaded with broken rows
    // would return fewer than 8 good matches — silently hiding real foods.
    const broken = Array.from({ length: 20 }, (_, i) =>
      custom({ name: `Broken zz${i}`, per100: undefined }),
    );
    const good = Array.from({ length: 10 }, (_, i) =>
      custom({ name: `Good zz${i}`, _id: `good-${i}` }),
    );
    const results = searchFoods("zz", [...broken, ...good]);

    expect(results).toHaveLength(SEARCH_LIMIT);
    expect(results.every((f) => f.name.startsWith("Good"))).toBe(true);
  });

  it("reports what it hid, so a surface can say so", () => {
    const broken = custom({ name: "Broken Pea Protein", per100: undefined });
    const hidden = unusableFoods(foodPool([broken]));

    expect(hidden.map((f) => f.name)).toEqual(["Broken Pea Protein"]);
  });

  it("finds nothing unusable in FOOD_DB itself", () => {
    expect(unusableFoods(FOOD_DB)).toEqual([]);
  });
});

describe("foodIdentity / isSameFood — D6, the silent wrong-macros merge", () => {
  it("treats a custom food and a built-in with the SAME NAME as different", () => {
    // The bug: pick both and the old app merges them into one row, keeping
    // whichever landed first and using its macros for the whole quantity.
    const builtIn = FOOD_DB.find((f) => f.name === "Banana")!;
    const mine = custom({
      _id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      name: "Banana",
      unit: "piece",
      per100: undefined,
      perUnit: { kcal: 135, pro: 1.6, carb: 34, fat: 0.4 },
    });

    expect(isSameFood(builtIn, mine)).toBe(false);
    expect(foodIdentity(builtIn)).not.toBe(foodIdentity(mine));
  });

  it("treats the same custom food as itself, by id", () => {
    const mine = custom({ _id: "same-id" });
    const again = custom({ _id: "same-id", name: "Renamed Since" });
    expect(isSameFood(mine, again)).toBe(true);
  });

  it("treats the same built-in as itself, by name", () => {
    const banana = FOOD_DB.find((f) => f.name === "Banana")!;
    expect(isSameFood(banana, { ...banana })).toBe(true);
  });

  it("keeps two different custom foods apart even if named alike", () => {
    expect(isSameFood(custom({ _id: "a" }), custom({ _id: "b" }))).toBe(false);
  });

  it("namespaces ids and names so they can never collide", () => {
    // A custom food whose _id happened to equal another's name must not match.
    expect(foodIdentity(custom({ _id: "Banana" }))).toBe("id:Banana");
    expect(foodIdentity({ ...custom({ name: "Banana" }), _id: undefined })).toBe(
      "name:Banana",
    );
  });
});
