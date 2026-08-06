// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AddCustomFood } from "@/components/library/add-custom-food";
import { QuickLog, autoName } from "@/components/nutrition/quick-log";
import type { CustomFood, Result, StoredIngredient } from "@/lib/data";
import type { Macros } from "@/lib/engine/types";
import { FOOD_DB, type SearchableFood } from "@/lib/food-db";
import type { NewCustomFood } from "@/lib/hooks/useCustomFoods";

/** Quick Log's `onLog`, typed so the mock's call tuple is not inferred as `[]`. */
type LogFn = (
  name: string,
  macros: Macros,
  ings: readonly StoredIngredient[],
) => Promise<boolean>;

afterEach(cleanup); // see the note in food-search.test.tsx

/* ────────────────────────────────────────────────────────────────────────────
   Add Custom Food — the two things that are silently wrong when they break.
   ──────────────────────────────────────────────────────────────────────────── */

function setupForm(existing: readonly CustomFood[] = []) {
  const onSave = vi.fn(
    async (food: NewCustomFood): Promise<Result<CustomFood>> => ({
      ok: true,
      data: { ...food, _id: "new" },
    }),
  );
  render(
    <AddCustomFood existing={existing} onSave={onSave} onSaved={vi.fn()} />,
  );
  return { onSave };
}

const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("AddCustomFood — SA comma decimals", () => {
  it("reads 10,6 as 10.6 and not as 10", () => {
    // `parseFloat("10,6")` is 10. That silent truncation on a protein box is
    // exactly the class of bug the correctness oracle exists to catch, and it
    // is why these inputs are type=text rather than type=number (old app 1742).
    const { onSave } = setupForm();

    fill("Food name", "Pea Protein");
    fill("Calories", "375");
    fill("Protein", "10,6");
    fireEvent.click(screen.getByText("Save food"));

    return waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave.mock.calls[0][0].per100?.pro).toBe(10.6);
    });
  });

  it("rejects junk rather than letting parseFloat coerce it", () => {
    const { onSave } = setupForm();

    fill("Food name", "Nonsense");
    fill("Calories", "12abc");
    fireEvent.click(screen.getByText("Save food"));

    expect(onSave).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("must be a number");
  });

  it("requires a name and calories", () => {
    const { onSave } = setupForm();

    fireEvent.click(screen.getByText("Save food"));
    expect(onSave).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Give the food a name");

    fill("Food name", "Nameless no more");
    fireEvent.click(screen.getByText("Save food"));
    expect(onSave).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Calories are required");
  });
});

describe("AddCustomFood — the gram-unit guard (D7, write side)", () => {
  it("refuses to save a per-unit food whose unit is g or ml", () => {
    // A per-unit food stored with unit "g" makes `isGramUnit` true, so
    // `macrosForQuantity` reads the per100 that is not there and THROWS —
    // a dead screen every time that food is used (old app 1770).
    const { onSave } = setupForm();

    fill("Food name", "Bad Unit");
    fireEvent.change(screen.getByLabelText("Measured per"), {
      target: { value: "unit" },
    });
    fill("Unit name", "g");
    fill("Calories", "100");
    fireEvent.click(screen.getByText("Save food"));

    expect(onSave).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("weight/volume unit");
  });

  it("falls back to 'unit' rather than to grams when the unit name is blank", () => {
    const { onSave } = setupForm();

    fill("Food name", "Unnamed Unit");
    fireEvent.change(screen.getByLabelText("Measured per"), {
      target: { value: "unit" },
    });
    fill("Calories", "100");
    fireEvent.click(screen.getByText("Save food"));

    return waitFor(() => {
      const food = onSave.mock.calls[0][0];
      expect(food.unit).toBe("unit");
      expect(food.perUnit).toBeDefined();
      expect(food.per100).toBeUndefined();
    });
  });

  it("moves the default quantity with the measurement type", () => {
    setupForm();
    const qty = () =>
      (screen.getByLabelText(/^Default qty/) as HTMLInputElement).value;

    expect(qty()).toBe("100");
    fireEvent.change(screen.getByLabelText("Measured per"), {
      target: { value: "unit" },
    });
    expect(qty()).toBe("1");
    fireEvent.change(screen.getByLabelText("Measured per"), {
      target: { value: "g" },
    });
    expect(qty()).toBe("100");
  });

  it("saves a g food on the per100 basis, with barcode null (R1)", () => {
    const { onSave } = setupForm();

    fill("Food name", "Plain Grams");
    fill("Calories", "200");
    fireEvent.click(screen.getByText("Save food"));

    return waitFor(() => {
      const food = onSave.mock.calls[0][0];
      expect(food.unit).toBe("g");
      expect(food.per100).toEqual({ kcal: 200, pro: 0, carb: 0, fat: 0 });
      // Phase 5 strips the barcode field, which is why `save` always takes
      // the upsert-on-NAME branch.
      expect(food.barcode).toBeNull();
    });
  });
});

/* ────────────────────────────────────────────────────────────────────────────
   Quick Log's auto-name — old app 2281–2283.
   ──────────────────────────────────────────────────────────────────────────── */

const food = (name: string): SearchableFood => {
  const f = FOOD_DB.find((x) => x.name === name);
  if (!f) throw new Error(`fixture missing: ${name}`);
  return f;
};

describe("autoName", () => {
  it("names a single ingredient in full, with its unit", () => {
    expect(autoName([{ food: food("Banana"), qty: 1 }])).toBe(
      "Banana (1piece)",
    );
  });

  it("abbreviates several to first word + quantity", () => {
    expect(
      autoName([
        { food: food("Rolled Oats"), qty: 80 },
        { food: food("Clover Low Fat Milk"), qty: 250 },
      ]),
    ).toBe("Rolled 80g, Clover 250ml");
  });
});

describe("QuickLog", () => {
  it("logs the composer total under the auto-name and clears on success", async () => {
    const onLog = vi.fn<LogFn>(async () => true);
    render(<QuickLog pool={FOOD_DB} onLog={onLog} />);

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Vejoy Tofu" } });
    fireEvent.mouseDown(screen.getAllByRole("option")[0]);

    fireEvent.click(screen.getByText("+ Log to Today"));

    await waitFor(() => expect(onLog).toHaveBeenCalledTimes(1));
    const [name, macros, ings] = onLog.mock.calls[0];
    expect(name).toBe("Vejoy Tofu (150g)");
    expect(macros.kcal).toBe(330);
    // Bare-number qty — the `meal_logs` convention, not `custom_meals`'.
    expect(ings[0].qty).toBe("150");

    await waitFor(() =>
      expect(screen.queryByText("+ Log to Today")).toBeNull(),
    );
  });

  it("KEEPS the rows when the log fails", async () => {
    const onLog = vi.fn<LogFn>(async () => false);
    render(<QuickLog pool={FOOD_DB} onLog={onLog} />);

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Vejoy Tofu" } });
    fireEvent.mouseDown(screen.getAllByRole("option")[0]);

    fireEvent.click(screen.getByText("+ Log to Today"));

    await waitFor(() => expect(onLog).toHaveBeenCalledTimes(1));
    // Retyping four ingredients to retry a network blip is how people stop
    // logging altogether.
    expect(document.body.textContent).toContain("Vejoy Tofu");
  });
});
