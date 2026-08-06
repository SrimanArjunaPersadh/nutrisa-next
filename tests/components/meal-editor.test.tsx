// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MealEditor } from "@/components/nutrition/meal-editor";
import type { LoggedMeal, StoredIngredient } from "@/lib/data";
import type { Macros } from "@/lib/engine/types";
import { FOOD_DB } from "@/lib/food-db";

/**
 * The logged-meal editor, and specifically the Add Item path Phase 5 bolted on.
 *
 * THIS FILE EXISTS BECAUSE OF A BUG IT WOULD HAVE CAUGHT. Phase 5 shipped
 * `meal-editor.tsx` with no test of any kind, and the review found that
 * removing an added row filtered `added` but not the positional `qty` overrides
 * — so the row that shifted up inherited the deleted row's quantity, and that
 * wrong number went into `meal_logs`. Wrong stored macros with nothing on
 * screen to suggest anything had gone wrong is precisely what Plan §6's oracle
 * exists to catch.
 */

afterEach(cleanup); // see the note in food-search.test.tsx

/** A logged meal with no ingredient breakdown → the MacroEditor branch. */
const MACRO_ONLY: LoggedMeal = {
  _id: "log-1",
  _libId: null,
  _ings: null,
  name: "Leftovers",
  time: "13:05",
  sortOrder: 1,
  kcal: 300,
  pro: 10,
  carb: 40,
  fat: 8,
};

/** A logged meal WITH ingredients → the IngredientEditor branch. */
const WITH_INGS: LoggedMeal = {
  ...MACRO_ONLY,
  _ings: [
    { name: "Tofu", qty: "150", kcal: 330, pro: 18.9, carb: 6, fat: 20.9 },
  ],
};

function setup(meal: LoggedMeal) {
  const onSave = vi.fn<
    (macros: Macros, ings?: readonly StoredIngredient[] | null) => Promise<void>
  >(async () => {});

  render(
    <MealEditor
      meal={meal}
      library={[]}
      pool={FOOD_DB}
      onSave={onSave}
      onCancel={vi.fn()}
      saving={false}
    />,
  );

  return { onSave };
}

function addItem(query: string) {
  const input = screen.getByRole("combobox");
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: query } });
  fireEvent.mouseDown(screen.getAllByRole("option")[0]);
}

const qtyBox = (name: string) =>
  screen.getByLabelText(`${name} quantity`) as HTMLInputElement;

describe("MealEditor — removing an added row keeps quantities on their own rows", () => {
  it("does not hand a deleted row's quantity to the row below it", async () => {
    const { onSave } = setup(MACRO_ONLY);

    addItem("Rolled Oats"); // defaultQty 80
    addItem("Banana"); // defaultQty 1, per-unit

    // Re-portion the OATS only. Overrides are positional: qty[0] = 200.
    fireEvent.change(qtyBox("Rolled Oats"), { target: { value: "200" } });

    // Now delete the oats. Banana shifts from index 1 to index 0 — and before
    // the fix it inherited qty[0] = 200, i.e. 200 bananas, 17 800 kcal, saved
    // to the database without a word.
    fireEvent.click(screen.getByLabelText("Remove Rolled Oats"));

    expect(qtyBox("Banana").value).toBe("1");

    fireEvent.click(screen.getByText("✓ Update"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    const [macros, ings] = onSave.mock.calls[0];
    // Original 300 kcal + one banana at 89.
    expect(macros.kcal).toBe(389);
    expect(ings).toHaveLength(1);
    expect(ings![0].name).toBe("Banana");
    expect(ings![0].qty).toBe("1");
  });

  it("keeps the surviving row's OWN override when an earlier row goes", async () => {
    setup(MACRO_ONLY);

    addItem("Rolled Oats");
    addItem("Banana");

    fireEvent.change(qtyBox("Banana"), { target: { value: "3" } });
    fireEvent.click(screen.getByLabelText("Remove Rolled Oats"));

    // The banana's own edit must travel with it, not be dropped either.
    expect(qtyBox("Banana").value).toBe("3");
  });
});

describe("MealEditor — Add Item on a meal that has no breakdown", () => {
  it("adds to the meal's stored macros rather than replacing them", async () => {
    const { onSave } = setup(MACRO_ONLY);

    addItem("Rolled Oats"); // 80g of 380kcal/100g → 304

    fireEvent.click(screen.getByText("✓ Update"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    // 300 + 304. The base is the meal's stored figure, not the macro boxes.
    expect(onSave.mock.calls[0][0].kcal).toBe(604);
  });

  it("edits macros directly while nothing has been added", async () => {
    const { onSave } = setup(MACRO_ONLY);

    fireEvent.change(screen.getByLabelText("Kcal"), { target: { value: "450" } });
    fireEvent.click(screen.getByText("✓ Update"));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].kcal).toBe(450);
    // `ings` omitted, not null — a macro-only edit leaves the stored column be.
    expect(onSave.mock.calls[0][1]).toBeUndefined();
  });
});

describe("MealEditor — Add Item on a meal that has a breakdown", () => {
  it("appends the food to the existing ingredient rows", async () => {
    const { onSave } = setup(WITH_INGS);

    addItem("Rolled Oats");

    fireEvent.click(screen.getByText("✓ Update"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    const [macros, ings] = onSave.mock.calls[0];
    expect(ings).toHaveLength(2);
    expect(ings![1].name).toBe("Rolled Oats");
    // 330 (tofu, as stored) + 304 (80g oats).
    expect(macros.kcal).toBe(634);
  });

  it("renders no Add Item widget when no pool is supplied", () => {
    render(
      <MealEditor
        meal={WITH_INGS}
        library={[]}
        onSave={vi.fn(async () => {})}
        onCancel={vi.fn()}
        saving={false}
      />,
    );

    // The editor must stay usable exactly as Phase 4 shipped it.
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByText("✓ Update")).toBeTruthy();
  });
});
