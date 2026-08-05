/**
 * The built-in food database — Plan §5.4, ported from `FOOD_DB`
 * (`docs/reference/old-index.html` 822–897, entries at 823–896).
 *
 * **SOURCE, NOT DATA (PHASE-5-DECISIONS premise 3).** These 74 foods live in no
 * Supabase table, have no `created_at`, and are not oracle rows. They are a
 * constant in the old app and they are a constant here. Seeding them into
 * `custom_foods` would be a data change wearing a port's clothes, and it would
 * break the pool ordering that decides search ties.
 *
 * **The transcription is machine-verified.** `tests/food-db.test.ts` parses the
 * FOOD_DB literal straight out of `docs/reference/old-index.html` and compares
 * it to this module field by field. A typo in a macro here is a wrong number in
 * every meal built from that food, so it is not checked by eye.
 *
 * Exactly one of `per100` / `perUnit` is meaningful on each entry, chosen by
 * `isGramUnit` (`lib/engine/macros.ts`). `g`/`ml` foods carry `per100`;
 * everything else carries `perUnit` plus a human `unitLabel`.
 */

import type { Food } from "./engine/types";

/**
 * A food as the SEARCH sees it: the engine's arithmetic input plus the four
 * fields a result row and a new composer row need.
 *
 * The engine's `Food` deliberately carries only `unit` + one macro basis —
 * everything `macrosForQuantity` computes with, and nothing else. Widening
 * `Food` to hold a name and a category would put display concerns on the
 * arithmetic input, which is the boundary Plan §6 exists to defend. So the
 * search pool gets its own name instead (eng review D3).
 *
 * `CustomFood` (`lib/data/types.ts`) is structurally assignable to this, which
 * is what lets the pool mix built-ins and user rows with no adapter.
 */
export type SearchableFood = Food & {
  readonly name: string;
  readonly cat: string;
  /** The quantity a fresh row starts at, in the food's own unit. */
  readonly defaultQty: number;
  /** Human label for a per-unit food, e.g. `"scoop (33g)"`. Absent on g/ml. */
  readonly unitLabel?: string;
};

/**
 * Categories offered by the Add Custom Food form. Old app `FOOD_CATS` (450).
 * Mirrors the `cat` values already present in `FOOD_DB`.
 */
export const FOOD_CATS = [
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
] as const;

/**
 * Foods that raise a warning when added to a composer. Old app `FLAGGED_FOODS`
 * (453–456). A closed two-entry map; the message is the old app's, verbatim.
 */
export const FLAGGED_FOODS: Readonly<Record<string, string>> = {
  "Olive Oil": "⚠️ Olive oil is off-plan. Use cooking spray only.",
  "Coconut Oil": "⚠️ Coconut oil is off-plan. Use cooking spray only.",
};

/** Is this food one the old app flags as off-plan? */
export function isFlagged(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(FLAGGED_FOODS, name);
}

/**
 * The 74 built-in foods, in the old app's order. Order is load-bearing: the
 * pool is `[...FOOD_DB, ...customFoods]` (old app 943) and search returns the
 * first 8 matches, so this ordering decides which foods win a crowded query.
 */
export const FOOD_DB: readonly SearchableFood[] = [
  { name: "Vejoy Tofu", cat: "Protein", unit: "g", defaultQty: 150, per100: { kcal: 220, pro: 12.6, carb: 4, fat: 13.9 } },
  { name: "Yama BBQ Seitan", cat: "Protein", unit: "steak", defaultQty: 1, perUnit: { kcal: 215, pro: 28.3, carb: 21.3, fat: 1.7 }, unitLabel: "steak (133g)" },
  { name: "Fry's Braai Sausage", cat: "Protein", unit: "sausage", defaultQty: 1, perUnit: { kcal: 84, pro: 7.6, carb: 4, fat: 3.7 }, unitLabel: "sausage (~47g)" },
  { name: "Soya Chunks (dry)", cat: "Protein", unit: "g", defaultQty: 80, per100: { kcal: 350, pro: 52, carb: 25, fat: 1.3 } },
  { name: "Paneer (low fat)", cat: "Protein", unit: "g", defaultQty: 100, per100: { kcal: 265, pro: 18, carb: 3, fat: 20 } },
  { name: "Clover Greek Yoghurt", cat: "Dairy", unit: "g", defaultQty: 150, per100: { kcal: 53, pro: 9.5, carb: 2, fat: 0.7 } },
  { name: "Clover Low Fat Milk", cat: "Dairy", unit: "ml", defaultQty: 250, per100: { kcal: 47, pro: 3.2, carb: 4.8, fat: 1 } },
  { name: "Clover Gouda Cheese", cat: "Dairy", unit: "g", defaultQty: 20, per100: { kcal: 383, pro: 25, carb: 0, fat: 31 } },
  { name: "Clover Cottage Cheese", cat: "Dairy", unit: "g", defaultQty: 100, per100: { kcal: 72, pro: 12, carb: 3, fat: 1 } },
  { name: "Vanilla Whey Protein", cat: "Supplement", unit: "scoop", defaultQty: 1, perUnit: { kcal: 132, pro: 27, carb: 2, fat: 1.4 }, unitLabel: "scoop (33g)" },
  { name: "Choc Mint Whey Protein", cat: "Supplement", unit: "scoop", defaultQty: 1, perUnit: { kcal: 132, pro: 27, carb: 2, fat: 1.4 }, unitLabel: "scoop (33g)" },
  { name: "Peanut Butter Cup Whey Protein", cat: "Supplement", unit: "scoop", defaultQty: 1, perUnit: { kcal: 132, pro: 27, carb: 2, fat: 1.4 }, unitLabel: "scoop (33g)" },
  { name: "USN Hardcore Whey gH", cat: "Supplement", unit: "scoop", defaultQty: 1, perUnit: { kcal: 132, pro: 27, carb: 2, fat: 1.4 }, unitLabel: "scoop (33g)" },
  { name: "Nutritional Yeast", cat: "Supplement", unit: "tbsp", defaultQty: 2, perUnit: { kcal: 45, pro: 6.9, carb: 5.2, fat: 0.5 }, unitLabel: "tbsp (13g)" },
  { name: "Creatine", cat: "Supplement", unit: "g", defaultQty: 5, per100: { kcal: 0, pro: 0, carb: 0, fat: 0 } },
  { name: "Rolled Oats", cat: "Carb", unit: "g", defaultQty: 80, per100: { kcal: 380, pro: 12.5, carb: 67.5, fat: 6.25 } },
  { name: "San Remo Pulse Pasta", cat: "Carb", unit: "g", defaultQty: 80, per100: { kcal: 361, pro: 21.3, carb: 56.7, fat: 3.2 } },
  { name: "Sunbake Sourdough", cat: "Carb", unit: "slice", defaultQty: 2, perUnit: { kcal: 90, pro: 3.4, carb: 17, fat: 0.55 }, unitLabel: "slice (37g)" },
  { name: "Brown Rice (dry)", cat: "Carb", unit: "g", defaultQty: 75, per100: { kcal: 362, pro: 7.5, carb: 76, fat: 2.7 } },
  { name: "White Rice (dry)", cat: "Carb", unit: "g", defaultQty: 75, per100: { kcal: 365, pro: 7, carb: 80, fat: 0.7 } },
  { name: "Quinoa (dry)", cat: "Carb", unit: "g", defaultQty: 75, per100: { kcal: 368, pro: 14, carb: 64, fat: 6 } },
  { name: "Sweet Potato", cat: "Carb", unit: "g", defaultQty: 150, per100: { kcal: 86, pro: 1.6, carb: 20, fat: 0.1 } },
  { name: "Whole Wheat Bread", cat: "Carb", unit: "slice", defaultQty: 2, perUnit: { kcal: 69, pro: 3.6, carb: 11.4, fat: 0.9 }, unitLabel: "slice (28g)" },
  { name: "Corn Tortilla", cat: "Carb", unit: "piece", defaultQty: 2, perUnit: { kcal: 58, pro: 1.5, carb: 12.2, fat: 0.7 }, unitLabel: "tortilla (27g)" },
  { name: "Rice Cake", cat: "Carb", unit: "piece", defaultQty: 2, perUnit: { kcal: 35, pro: 0.7, carb: 7.3, fat: 0.3 }, unitLabel: "cake (9g)" },
  { name: "Bakers Salticrax", cat: "Carb", unit: "biscuit", defaultQty: 1, perUnit: { kcal: 32, pro: 1.3, carb: 7.0, fat: 3.2 }, unitLabel: "biscuit (6.5g)" },
  { name: "Kellogg's Coco Pops", cat: "Carb", unit: "g", defaultQty: 30, per100: { kcal: 347, pro: 7, carb: 76.7, fat: 1.7 } },
  { name: "Capsicum (Bell Pepper)", cat: "Vegetable", unit: "g", defaultQty: 100, per100: { kcal: 31, pro: 1, carb: 6, fat: 0.3 } },
  { name: "Tomato", cat: "Vegetable", unit: "piece", defaultQty: 1, perUnit: { kcal: 22, pro: 1.1, carb: 4.8, fat: 0.2 }, unitLabel: "medium (120g)" },
  { name: "Cherry Tomatoes", cat: "Vegetable", unit: "g", defaultQty: 100, per100: { kcal: 18, pro: 0.9, carb: 3.9, fat: 0.2 } },
  { name: "Onion", cat: "Vegetable", unit: "piece", defaultQty: 1, perUnit: { kcal: 44, pro: 1.2, carb: 10.3, fat: 0.1 }, unitLabel: "medium (110g)" },
  { name: "Spinach", cat: "Vegetable", unit: "g", defaultQty: 60, per100: { kcal: 23, pro: 2.9, carb: 3.6, fat: 0.4 } },
  { name: "Broccoli", cat: "Vegetable", unit: "g", defaultQty: 100, per100: { kcal: 34, pro: 2.8, carb: 7, fat: 0.4 } },
  { name: "Cucumber", cat: "Vegetable", unit: "g", defaultQty: 100, per100: { kcal: 15, pro: 0.7, carb: 3.6, fat: 0.1 } },
  { name: "Carrot", cat: "Vegetable", unit: "piece", defaultQty: 1, perUnit: { kcal: 25, pro: 0.6, carb: 6, fat: 0.1 }, unitLabel: "medium (60g)" },
  { name: "Mushroom", cat: "Vegetable", unit: "g", defaultQty: 80, per100: { kcal: 22, pro: 3.1, carb: 3.3, fat: 0.3 } },
  { name: "Courgette (Zucchini)", cat: "Vegetable", unit: "g", defaultQty: 120, per100: { kcal: 17, pro: 1.2, carb: 3.1, fat: 0.3 } },
  { name: "Beetroot", cat: "Vegetable", unit: "g", defaultQty: 80, per100: { kcal: 43, pro: 1.6, carb: 9.6, fat: 0.2 } },
  { name: "Green Beans", cat: "Vegetable", unit: "g", defaultQty: 80, per100: { kcal: 31, pro: 1.8, carb: 7, fat: 0.1 } },
  { name: "Mixed Veg (frozen)", cat: "Vegetable", unit: "g", defaultQty: 100, per100: { kcal: 55, pro: 3, carb: 10, fat: 0.5 } },
  { name: "Banana", cat: "Fruit", unit: "piece", defaultQty: 1, perUnit: { kcal: 89, pro: 1.1, carb: 23, fat: 0.3 }, unitLabel: "medium (100g)" },
  { name: "Banana (small)", cat: "Fruit", unit: "piece", defaultQty: 1, perUnit: { kcal: 72, pro: 0.9, carb: 18, fat: 0.2 }, unitLabel: "small (80g)" },
  { name: "Mixed Frozen Fruit", cat: "Fruit", unit: "g", defaultQty: 100, per100: { kcal: 50, pro: 0.5, carb: 12, fat: 0.2 } },
  { name: "Apple", cat: "Fruit", unit: "piece", defaultQty: 1, perUnit: { kcal: 95, pro: 0.5, carb: 25, fat: 0.3 }, unitLabel: "medium (182g)" },
  { name: "Blueberries", cat: "Fruit", unit: "g", defaultQty: 80, per100: { kcal: 57, pro: 0.7, carb: 14, fat: 0.3 } },
  { name: "Strawberries", cat: "Fruit", unit: "g", defaultQty: 100, per100: { kcal: 32, pro: 0.7, carb: 7.7, fat: 0.3 } },
  { name: "Mango", cat: "Fruit", unit: "g", defaultQty: 100, per100: { kcal: 60, pro: 0.8, carb: 15, fat: 0.4 } },
  { name: "Orange", cat: "Fruit", unit: "piece", defaultQty: 1, perUnit: { kcal: 62, pro: 1.2, carb: 15, fat: 0.2 }, unitLabel: "medium (130g)" },
  { name: "Dates", cat: "Fruit", unit: "piece", defaultQty: 3, perUnit: { kcal: 20, pro: 0.2, carb: 5.3, fat: 0 }, unitLabel: "date (8g)" },
  { name: "Amla (Indian Gooseberry)", cat: "Fruit", unit: "piece", defaultQty: 2, perUnit: { kcal: 5, pro: 0.1, carb: 1.3, fat: 0 }, unitLabel: "amla (10g)" },
  { name: "Olive Oil", cat: "Fat", unit: "tbsp", defaultQty: 1, perUnit: { kcal: 119, pro: 0, carb: 0, fat: 13.5 }, unitLabel: "tbsp (14g)" },
  { name: "Coconut Oil", cat: "Fat", unit: "tbsp", defaultQty: 1, perUnit: { kcal: 120, pro: 0, carb: 0, fat: 14 }, unitLabel: "tbsp (14g)" },
  { name: "Peanut Butter", cat: "Fat", unit: "tbsp", defaultQty: 2, perUnit: { kcal: 94, pro: 4, carb: 3.2, fat: 8 }, unitLabel: "tbsp (16g)" },
  { name: "Almonds", cat: "Fat", unit: "piece", defaultQty: 10, perUnit: { kcal: 7, pro: 0.3, carb: 0.3, fat: 0.6 }, unitLabel: "almond" },
  { name: "Cashews", cat: "Fat", unit: "g", defaultQty: 30, per100: { kcal: 553, pro: 18, carb: 30, fat: 44 } },
  { name: "Flaxseed", cat: "Fat", unit: "tbsp", defaultQty: 1, perUnit: { kcal: 55, pro: 1.9, carb: 3, fat: 4.3 }, unitLabel: "tbsp (10g)" },
  { name: "Chia Seeds", cat: "Fat", unit: "tbsp", defaultQty: 1, perUnit: { kcal: 58, pro: 2, carb: 5, fat: 3.7 }, unitLabel: "tbsp (12g)" },
  { name: "Avocado", cat: "Fat", unit: "g", defaultQty: 100, per100: { kcal: 160, pro: 2, carb: 9, fat: 15 } },
  { name: "Cooking Spray", cat: "Other", unit: "spray", defaultQty: 3, perUnit: { kcal: 1, pro: 0, carb: 0, fat: 0.1 }, unitLabel: "spray (1 sec)" },
  { name: "Chickpeas (cooked)", cat: "Legume", unit: "g", defaultQty: 100, per100: { kcal: 164, pro: 8.9, carb: 27, fat: 2.6 } },
  { name: "Black Beans (cooked)", cat: "Legume", unit: "g", defaultQty: 100, per100: { kcal: 132, pro: 8.9, carb: 24, fat: 0.5 } },
  { name: "Kidney Beans (cooked)", cat: "Legume", unit: "g", defaultQty: 100, per100: { kcal: 127, pro: 8.7, carb: 22.8, fat: 0.5 } },
  { name: "Lentils (cooked)", cat: "Legume", unit: "g", defaultQty: 100, per100: { kcal: 116, pro: 9, carb: 20, fat: 0.4 } },
  { name: "Green Peas", cat: "Legume", unit: "g", defaultQty: 80, per100: { kcal: 81, pro: 5.4, carb: 14, fat: 0.4 } },
  { name: "Soy Sauce", cat: "Condiment", unit: "tbsp", defaultQty: 1, perUnit: { kcal: 8, pro: 1.3, carb: 0.8, fat: 0.1 }, unitLabel: "tbsp (15ml)" },
  { name: "Tomato Sauce (passata)", cat: "Condiment", unit: "g", defaultQty: 100, per100: { kcal: 32, pro: 1.6, carb: 6.6, fat: 0.4 } },
  { name: "Illovo Maple Flavoured Syrup", cat: "Condiment", unit: "g", defaultQty: 10, per100: { kcal: 310, pro: 0, carb: 71, fat: 0 } },
  { name: "Honey", cat: "Condiment", unit: "tsp", defaultQty: 1, perUnit: { kcal: 21, pro: 0, carb: 5.7, fat: 0 }, unitLabel: "tsp (7g)" },
  { name: "Cinnamon", cat: "Spice", unit: "tsp", defaultQty: 1, perUnit: { kcal: 6, pro: 0.1, carb: 2, fat: 0 }, unitLabel: "tsp (2.5g)" },
  { name: "Turmeric", cat: "Spice", unit: "tsp", defaultQty: 1, perUnit: { kcal: 8, pro: 0.2, carb: 1.7, fat: 0.1 }, unitLabel: "tsp (2.5g)" },
  { name: "Garam Masala", cat: "Spice", unit: "tsp", defaultQty: 1, perUnit: { kcal: 9, pro: 0.3, carb: 1.5, fat: 0.4 }, unitLabel: "tsp (2.5g)" },
  { name: "Cumin", cat: "Spice", unit: "tsp", defaultQty: 1, perUnit: { kcal: 8, pro: 0.4, carb: 0.9, fat: 0.5 }, unitLabel: "tsp (2.5g)" },
  { name: "Black Pepper", cat: "Spice", unit: "tsp", defaultQty: 1, perUnit: { kcal: 6, pro: 0.2, carb: 1.4, fat: 0.1 }, unitLabel: "tsp (2.5g)" },
  { name: "Salt", cat: "Spice", unit: "pinch", defaultQty: 1, perUnit: { kcal: 0, pro: 0, carb: 0, fat: 0 }, unitLabel: "pinch" },
];
