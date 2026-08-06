// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MealBuilder } from "@/components/library/meal-builder";
import type { CustomMeal, Result } from "@/lib/data";
import { foodPool } from "@/lib/food-search";
import type { NewCustomMeal } from "@/lib/hooks/useCustomMeals";

/**
 * What the meal builder STORES, which is the only part of it the correctness
 * oracle can be wrong about. The arithmetic underneath is already tested
 * (`useComposer`, `sumIngredients`); this pins the shape of the row that
 * reaches `custom_meals`, quirks included.
 */

afterEach(cleanup); // see the note in food-search.test.tsx

const POOL = foodPool();

const saved = (meal: NewCustomMeal): CustomMeal => ({
  ...meal,
  _id: "new-id",
  id: "new-id",
});

function setup(
  existing: readonly CustomMeal[] = [],
  existingKnown = true,
) {
  const onSave = vi.fn(
    async (meal: NewCustomMeal): Promise<Result<CustomMeal>> => ({
      ok: true,
      data: saved(meal),
    }),
  );
  const onSaved = vi.fn();

  render(
    <MealBuilder
      pool={POOL}
      existing={existing}
      existingKnown={existingKnown}
      onSave={onSave}
      onSaved={onSaved}
    />,
  );

  return { onSave, onSaved };
}

function addFood(query: string) {
  const input = screen.getByRole("combobox");
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: query } });
  fireEvent.mouseDown(screen.getAllByRole("option")[0]);
}

function nameIt(name: string) {
  fireEvent.change(screen.getByLabelText("Meal name"), {
    target: { value: name },
  });
}

describe("MealBuilder — what it stores", () => {
  it("writes the composer total and one ingredient row per food", async () => {
    const { onSave } = setup();

    addFood("Vejoy Tofu"); // 150g of a 220kcal/100g food → 330
    nameIt("My Tofu Bowl");
    fireEvent.click(screen.getByText("Save to Library"));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    const meal = onSave.mock.calls[0][0];
    expect(meal.name).toBe("My Tofu Bowl");
    expect(meal.kcal).toBe(330);
    expect(meal.ingredients).toHaveLength(1);
    expect(meal.ingredients[0].name).toBe("Vejoy Tofu");
    expect(meal.ingredients[0].kcal).toBe(330);
  });

  it("suffixes every quantity with 'g' even for a per-unit food — the old app's quirk", async () => {
    const { onSave } = setup();

    // One SCOOP of whey. The old app writes `qty: ing.qty + 'g'` regardless of
    // unit (1077), so this is stored as "1g". A wrong LABEL, never a wrong
    // number: the macros stored beside it are the macros for that quantity, so
    // `baseQty` reads back 1 and the gram editor scales from 1. Every existing
    // `custom_meals` row was written this way and those rows are the oracle.
    addFood("Vanilla Whey Protein");
    nameIt("Shake");
    fireEvent.click(screen.getByText("Save to Library"));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    expect(onSave.mock.calls[0][0].ingredients[0].qty).toBe("1g");
  });

  it("defaults the note to the meal name", async () => {
    const { onSave } = setup();

    addFood("Vejoy Tofu");
    nameIt("Plain");
    fireEvent.click(screen.getByText("Save to Library"));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    // `note: notes || name` — old app 1073.
    expect(onSave.mock.calls[0][0].note).toBe("Plain");
  });

  it("clears the builder after a successful save", async () => {
    const { onSaved } = setup();

    addFood("Vejoy Tofu");
    nameIt("Gone After Save");
    fireEvent.click(screen.getByText("Save to Library"));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("Gone After Save"));
    expect(document.body.textContent).toContain(
      "Search and add ingredients above",
    );
  });

  it("KEEPS the builder's contents when the save fails", async () => {
    const onSave = vi.fn(
      async (): Promise<Result<CustomMeal>> => ({
        ok: false,
        error: { kind: "network", message: "offline" },
      }),
    );
    render(
      <MealBuilder
        pool={POOL}
        existing={[]}
        existingKnown
        onSave={onSave}
        onSaved={vi.fn()}
      />,
    );

    addFood("Vejoy Tofu");
    nameIt("Survives");
    fireEvent.click(screen.getByText("Save to Library"));

    await waitFor(() =>
      expect(document.body.textContent).toContain("was not saved"),
    );
    // The meal the user just built is still on screen. Clearing it to report a
    // failure would destroy the work (§4.4).
    expect(document.body.textContent).toContain("Vejoy Tofu");
    expect((screen.getByLabelText("Meal name") as HTMLInputElement).value).toBe(
      "Survives",
    );
  });
});

describe("MealBuilder — the guards that replaced confirm()", () => {
  it("will not save without a name or without ingredients", () => {
    setup();

    // No ingredients at all: the save button is not even rendered yet.
    expect(screen.queryByText("Save to Library")).toBeNull();

    addFood("Vejoy Tofu");
    const button = screen.getByText("Save to Library") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(document.body.textContent).toContain("Give the meal a name");
  });

  it("takes two presses when a row sits at 0 — the old app's zero-qty confirm", async () => {
    const { onSave } = setup();

    addFood("Vejoy Tofu");
    nameIt("Zeroed");
    fireEvent.change(screen.getByLabelText("Vejoy Tofu quantity"), {
      target: { value: "0" },
    });

    fireEvent.click(screen.getByText("Save anyway"));
    expect(onSave).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("is at 0");

    fireEvent.click(screen.getByText("Save anyway"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });

  it("says so when the library couldn't be read, instead of implying a check", async () => {
    // §21f. `saveCustomMeal` upserts on `name`, so a save replaces a row of
    // that name whether or not we managed to read the library. Silence would
    // turn "save my new meal" into "replace a meal I forgot I had".
    const { onSave } = setup([], false);

    addFood("Vejoy Tofu");
    nameIt("Might Already Exist");

    expect(document.body.textContent).toContain("couldn’t be read");
    expect(document.body.textContent).toContain("Might Already Exist");

    // It WARNS, it does not block — losing the meal you just built to a
    // transient network blip is the worse trade (Phase 3 §6 reasoning).
    fireEvent.click(screen.getByText("Save to Library"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });

  it("stays quiet about the read while no name has been typed", () => {
    setup([], false);
    addFood("Vejoy Tofu");

    // Nothing to warn about yet — the warning is about a specific name.
    expect(document.body.textContent).not.toContain("couldn’t be read");
  });

  it("saves an overwrite under the EXISTING row's exact casing", async () => {
    // The warning matches case-insensitively (old app 1067) but the upsert
    // targets `name` exactly. Writing the typed casing would insert a SECOND
    // row while the UI promised an overwrite.
    const existing: CustomMeal[] = [
      {
        _id: "1",
        id: "1",
        name: "My Tofu Bowl",
        cat: "Lunch",
        note: "",
        kcal: 1,
        pro: 1,
        carb: 1,
        fat: 1,
        ingredients: [],
      },
    ];
    const { onSave } = setup(existing);

    addFood("Vejoy Tofu");
    nameIt("my tofu bowl");

    expect(document.body.textContent).toContain("already exists");
    fireEvent.click(screen.getByText("Overwrite"));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].name).toBe("My Tofu Bowl");
  });
});
