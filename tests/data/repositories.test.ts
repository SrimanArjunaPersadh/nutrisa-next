import { afterEach, describe, expect, it } from "vitest";

import { __setSupabaseForTests, classifyError } from "../../lib/data/client";
import { deleteWeight, fetchWeights, logWeight } from "../../lib/data/weights";
import {
  addMeal,
  deleteMeal,
  fetchAllMeals,
  fetchMealsForDate,
  updateMeal,
} from "../../lib/data/meals";
import {
  deleteCustomMeal,
  fetchCustomMeals,
  saveCustomMeal,
} from "../../lib/data/customMeals";
import {
  deleteCustomFood,
  fetchCustomFoods,
  findCustomFoodByBarcode,
  saveCustomFood,
} from "../../lib/data/customFoods";
import { fetchAllWater, fetchWaterForDate, setWater } from "../../lib/data/water";
import type { CustomFood } from "../../lib/data/types";

import { createFakeSupabase } from "./fakeSupabase";
import mealFixture from "../fixtures/meal_logs.json";
import customFoodFixture from "../fixtures/custom_foods.json";

/**
 * Repository tests — query SHAPE and every `Result` path, no network.
 *
 * The mappers are oracled separately in `mappers.test.ts`. What these prove is the
 * part a mapper test cannot see: the table hit, the ordering keys, the `onConflict`
 * target, and that nothing ever throws at a caller.
 */

const rows = (mealFixture.rows as { row: unknown }[]).map((c) => c.row);
const foodRows = (customFoodFixture.rows as { row: unknown }[]).map((c) => c.row);

let fake: ReturnType<typeof createFakeSupabase>;

const use = (response = {}) => {
  fake = createFakeSupabase(response);
  __setSupabaseForTests(fake.client);
  return fake;
};

afterEach(() => __setSupabaseForTests(null));

describe("weights", () => {
  it("fetchWeights reads weight_logs ordered by date ascending", async () => {
    use({ data: [{ id: "a", date: "2026-05-05", weight: 91.1, created_at: "" }] });

    const result = await fetchWeights();

    expect(result.ok).toBe(true);
    expect(fake.last().table).toBe("weight_logs");
    expect(fake.last().orders).toEqual([{ column: "date", ascending: true }]);
    expect(result.ok && result.data).toEqual([{ date: "2026-05-05", weight: 91.1 }]);
  });

  it("logWeight upserts on date, so a re-weigh replaces rather than duplicates", async () => {
    use({ data: { id: "a", date: "2026-05-05", weight: 91.1, created_at: "" } });

    await logWeight("2026-05-05", 91.1);

    expect(fake.last().op).toBe("upsert");
    expect(fake.last().options).toEqual({ onConflict: "date" });
    expect(fake.last().payload).toEqual({ date: "2026-05-05", weight: 91.1 });
    expect(fake.last().single).toBe(true);
  });

  it("deleteWeight filters by date", async () => {
    use({ data: null, error: null });

    const result = await deleteWeight("2026-05-05");

    expect(result.ok).toBe(true);
    expect(fake.last().op).toBe("delete");
    expect(fake.last().filters).toEqual([{ column: "date", value: "2026-05-05" }]);
  });
});

describe("meals", () => {
  it("fetchMealsForDate orders by date, sort_order, THEN id", async () => {
    use({ data: rows });

    const result = await fetchMealsForDate("2026-06-03");

    expect(result.ok).toBe(true);
    expect(fake.last().filters).toEqual([{ column: "date", value: "2026-06-03" }]);
    // The third key is ours — sort_order is not unique, so without it ties are
    // resolved at Postgres's discretion. PHASE-2-DECISIONS §4.
    expect(fake.last().orders.map((o) => o.column)).toEqual([
      "date",
      "sort_order",
      "id",
    ]);
  });

  it("fetchAllMeals groups by date", async () => {
    use({ data: rows });

    const result = await fetchAllMeals();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.data).sort()).toEqual(["2026-06-01", "2026-06-03"]);
    expect(result.data["2026-06-03"]).toHaveLength(5);
  });

  it("addMeal writes the sortOrder it was given, unmodified", async () => {
    use({ data: rows[0] });

    await addMeal(
      "2026-06-01",
      { name: "T", kcal: 1, pro: 0, carb: 0, fat: 0, time: "7:00", _libId: null, _ings: null },
      5,
    );

    const payload = fake.last().payload as { sort_order: number };
    expect(payload.sort_order).toBe(5);
  });

  it("updateMeal leaves ings_json untouched when ings is undefined (old app 3395)", async () => {
    use({ data: rows[0] });

    await updateMeal("id-1", { kcal: 100, pro: 1, carb: 2, fat: 3 });

    expect(fake.last().payload).toEqual({ kcal: 100, pro: 1, carb: 2, fat: 3 });
    expect(fake.last().payload).not.toHaveProperty("ings_json");
  });

  it("updateMeal writes ings_json when ings is provided (old app 3374/3556)", async () => {
    use({ data: rows[0] });

    await updateMeal("id-1", { kcal: 100, pro: 1, carb: 2, fat: 3 }, [
      { name: "Egg", qty: "2", kcal: 100, pro: 1, carb: 2, fat: 3 },
    ]);

    const payload = fake.last().payload as { ings_json: string };
    expect(JSON.parse(payload.ings_json)[0].name).toBe("Egg");
  });

  it("updateMeal clears ings_json when passed null explicitly", async () => {
    use({ data: rows[0] });

    await updateMeal("id-1", { kcal: 1, pro: 0, carb: 0, fat: 0 }, null);

    expect((fake.last().payload as { ings_json: unknown }).ings_json).toBeNull();
  });

  it("deleteMeal with no id is a SUCCESS and touches nothing (old app 2036)", async () => {
    use();

    const result = await deleteMeal(null);

    expect(result.ok).toBe(true);
    expect(fake.calls).toHaveLength(0);
  });
});

describe("custom meals", () => {
  it("fetchCustomMeals orders by created_at", async () => {
    use({ data: [] });
    await fetchCustomMeals();
    expect(fake.last().table).toBe("custom_meals");
    expect(fake.last().orders).toEqual([{ column: "created_at", ascending: true }]);
  });

  it("deleteCustomMeal with no id is a SUCCESS and touches nothing", async () => {
    use();
    const result = await deleteCustomMeal(null);
    expect(result.ok).toBe(true);
    expect(fake.calls).toHaveLength(0);
  });

  it("saveCustomMeal upserts on name", async () => {
    use({
      data: {
        id: "a",
        name: "M",
        cat: "Supper",
        note: "",
        kcal: 1,
        pro: 0,
        carb: 0,
        fat: 0,
        ingredients: [],
        created_at: "",
      },
    });

    await saveCustomMeal({
      name: "M",
      cat: "Supper",
      note: "",
      kcal: 1,
      pro: 0,
      carb: 0,
      fat: 0,
      ingredients: [],
    });

    expect(fake.last().options).toEqual({ onConflict: "name" });
  });
});

describe("custom foods", () => {
  it("fetchCustomFoods maps the real rows", async () => {
    use({ data: foodRows });

    const result = await fetchCustomFoods();

    expect(result.ok).toBe(true);
    expect(result.ok && result.data).toHaveLength(foodRows.length);
  });

  it("saveCustomFood conflicts on barcode when there is one", async () => {
    use({ data: foodRows[0] });

    await saveCustomFood({
      name: "Koo Baked Beans",
      cat: "Protein",
      unit: "g",
      defaultQty: 100,
      per100: { kcal: 85, pro: 5, carb: 15, fat: 0.5 },
      barcode: "6001087001234",
    });

    expect(fake.last().options).toEqual({ onConflict: "barcode" });
  });

  it("saveCustomFood falls back to name when there is no barcode", async () => {
    use({ data: foodRows[0] });

    await saveCustomFood({
      name: "Homemade thing",
      cat: "Other",
      unit: "g",
      defaultQty: 100,
      per100: { kcal: 85, pro: 5, carb: 15, fat: 0.5 },
      barcode: null,
    });

    expect(fake.last().options).toEqual({ onConflict: "name" });
  });

  it("deleteCustomFood with no id is a SUCCESS and touches nothing", async () => {
    use();
    const result = await deleteCustomFood(null);
    expect(result.ok).toBe(true);
    expect(fake.calls).toHaveLength(0);
  });

  it("findCustomFoodByBarcode is pure and compares as strings", () => {
    const foods: CustomFood[] = [
      {
        name: "Koo",
        cat: "Protein",
        unit: "g",
        defaultQty: 100,
        barcode: "6001087001234",
      },
      { name: "Other", cat: "Other", unit: "g", defaultQty: 100, barcode: null },
    ];

    expect(findCustomFoodByBarcode(foods, "6001087001234")?.name).toBe("Koo");
    expect(findCustomFoodByBarcode(foods, 6001087001234)?.name).toBe("Koo");
    expect(findCustomFoodByBarcode(foods, " 6001087001234 ")?.name).toBe("Koo");
    expect(findCustomFoodByBarcode(foods, "nope")).toBeNull();
    expect(findCustomFoodByBarcode(foods, null)).toBeNull();
  });
});

describe("water", () => {
  it("fetchWaterForDate returns 0 when the day has no row", async () => {
    use({ data: [] });

    const result = await fetchWaterForDate("2026-07-31");

    expect(result).toEqual({ ok: true, data: 0 });
  });

  it("fetchWaterForDate returns the stored cups", async () => {
    use({ data: [{ id: "a", date: "2026-06-01", cups: 3, created_at: "" }] });
    const result = await fetchWaterForDate("2026-06-01");
    expect(result).toEqual({ ok: true, data: 3 });
  });

  it("fetchWaterForDate takes the LAST row if a date has more than one", async () => {
    // Uniqueness on water_logs.date is observed on a single stored row, not
    // schema-verified. If duplicates ever exist, both readers and the old app's
    // keyed-assignment (1984) must agree: last wins.
    use({
      data: [
        { id: "a", date: "2026-06-01", cups: 3, created_at: "" },
        { id: "b", date: "2026-06-01", cups: 7, created_at: "" },
      ],
    });

    expect(await fetchWaterForDate("2026-06-01")).toEqual({ ok: true, data: 7 });
  });

  it("fetchAllWater agrees with it — last row wins there too", async () => {
    use({
      data: [
        { id: "a", date: "2026-06-01", cups: 3, created_at: "" },
        { id: "b", date: "2026-06-01", cups: 7, created_at: "" },
      ],
    });

    const result = await fetchAllWater();
    expect(result.ok && result.data).toEqual({ "2026-06-01": 7 });
  });

  it("fetchAllWater builds a date → cups map", async () => {
    use({ data: [{ id: "a", date: "2026-06-01", cups: 3, created_at: "" }] });
    const result = await fetchAllWater();
    expect(result.ok && result.data).toEqual({ "2026-06-01": 3 });
  });

  it("setWater upserts on date AND reports failure — the deliberate divergence", async () => {
    use({ error: { message: "boom", code: "23505" } });

    const result = await setWater("2026-06-01", 4);

    expect(fake.last().options).toEqual({ onConflict: "date" });
    // The old app returned nothing here and only console.error'd (2168). A lost
    // water write must be visible — Plan §4.4. PHASE-2-DECISIONS §8.
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe("conflict");
  });
});

describe("failures never throw, and always say why", () => {
  it("classifies a missing ON CONFLICT constraint as a conflict", () => {
    expect(
      classifyError({
        code: "42P10",
        message: "there is no unique or exclusion constraint matching...",
      }).kind,
    ).toBe("conflict");
  });

  it("classifies a unique violation as a conflict", () => {
    expect(classifyError({ code: "23505", message: "duplicate key" }).kind).toBe(
      "conflict",
    );
  });

  it("classifies an empty .single() as not-found", () => {
    expect(classifyError({ code: "PGRST116", message: "no rows" }).kind).toBe(
      "not-found",
    );
  });

  it("classifies a dead connection as network", () => {
    expect(classifyError(new TypeError("Failed to fetch")).kind).toBe("network");
  });

  it("keeps the message even when it cannot classify", () => {
    const c = classifyError({ message: "something odd" });
    expect(c.kind).toBe("unknown");
    expect(c.message).toBe("something odd");
  });

  it("a thrown fetch error becomes a Result, not an exception", async () => {
    use({ throws: new TypeError("Failed to fetch") });

    const result = await fetchWeights();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe("network");
  });

  it("a Postgres error becomes a Result carrying the real message", async () => {
    use({ error: { message: "permission denied for table weight_logs", code: "42501" } });

    const result = await fetchWeights();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain("permission denied");
  });

  it("missing configuration fails loudly, by variable name, without throwing", async () => {
    __setSupabaseForTests(null);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    const result = await fetchWeights();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain("NEXT_PUBLIC_SUPABASE_URL");

    if (url !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  });
});
