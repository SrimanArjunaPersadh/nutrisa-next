// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CustomFood, Result } from "@/lib/data";
import { useCustomFoods } from "@/lib/hooks/useCustomFoods";

/**
 * `useCustomFoods` shares its whole body with `useCustomMeals` via
 * `useCollection` (eng review D8), and the state machine is tested there and in
 * `useCollection.test.ts`. What this file covers is what is DIFFERENT about
 * this hook: its vocabulary, and its deliberate refusal to filter.
 */

vi.mock("@/lib/data", () => ({
  fetchCustomFoods: vi.fn(),
  saveCustomFood: vi.fn(),
  deleteCustomFood: vi.fn(),
}));

const { fetchCustomFoods, saveCustomFood, deleteCustomFood } = await import(
  "@/lib/data"
);
const mockFetch = vi.mocked(fetchCustomFoods);
const mockSave = vi.mocked(saveCustomFood);
const mockDelete = vi.mocked(deleteCustomFood);

const FOODS: CustomFood[] = [
  {
    _id: "aaaaaaaa-0000-0000-0000-000000000001",
    name: "Woolworths Pea Protein",
    cat: "Protein",
    unit: "g",
    defaultQty: 30,
    per100: { kcal: 380, pro: 80, carb: 4, fat: 5 },
    barcode: "6001234567890",
  },
  {
    _id: "aaaaaaaa-0000-0000-0000-000000000002",
    name: "Corner Bakery Roll",
    cat: "Carb",
    unit: "roll",
    defaultQty: 1,
    perUnit: { kcal: 210, pro: 7, carb: 40, fat: 2.5 },
    unitLabel: "roll (80g)",
    barcode: null,
  },
];

const ok = <T,>(data: T): Result<T> => ({ ok: true, data });
const fail = <T,>(
  kind: "network" | "conflict" | "unknown",
  message: string,
): Result<T> => ({ ok: false, error: { kind, message } });

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue(ok(FOODS));
  mockSave.mockResolvedValue(ok(FOODS[0]));
  mockDelete.mockResolvedValue(ok(null));
});

describe("useCustomFoods — the four states", () => {
  it("reaches ready with every custom food", async () => {
    const { result } = renderHook(() => useCustomFoods());
    await waitFor(() => expect(result.current.state).toBe("ready"));

    expect(result.current.foods).toEqual(FOODS);
    expect(result.current.error).toBeNull();
  });

  it("is empty before the user has added any food", async () => {
    // The normal state of a fresh install, and the Foods tab renders an
    // invitation rather than a blank panel.
    mockFetch.mockResolvedValue(ok([]));
    const { result } = renderHook(() => useCustomFoods());

    await waitFor(() => expect(result.current.state).toBe("empty"));
    expect(result.current.foods).toEqual([]);
  });

  it("carries the real error message", async () => {
    mockFetch.mockResolvedValue(fail("network", "Failed to fetch"));
    const { result } = renderHook(() => useCustomFoods());

    await waitFor(() => expect(result.current.state).toBe("error"));
    expect(result.current.error).toEqual({
      kind: "network",
      message: "Failed to fetch",
    });
  });
});

describe("useCustomFoods — returns unusable foods UNFILTERED, on purpose", () => {
  it("hands back a food whose basis does not match its unit", async () => {
    // A row like this crashes `macrosForQuantity`, and `lib/food-search.ts`
    // keeps it out of SEARCH results (D7). But the hook must still return it:
    // the Foods tab has to show a broken food so you can delete it. Filter at
    // the search boundary, never at the source.
    const poisoned: CustomFood = {
      _id: "aaaaaaaa-0000-0000-0000-000000000003",
      name: "Half-written Row",
      cat: "Other",
      unit: "g",
      defaultQty: 100,
      barcode: null,
    };
    mockFetch.mockResolvedValue(ok([...FOODS, poisoned]));

    const { result } = renderHook(() => useCustomFoods());
    await waitFor(() => expect(result.current.state).toBe("ready"));

    expect(result.current.foods).toHaveLength(3);
    expect(result.current.foods.map((f) => f.name)).toContain("Half-written Row");
  });
});

describe("useCustomFoods — writes", () => {
  it("refetches after a save, so all three searches see the new food", async () => {
    // Success criterion 6: add a food, then find it in every search without a
    // reload. The page owns this hook and passes the pool down (D4), so one
    // refetch here updates every mounted FoodSearch at once.
    const { result } = renderHook(() => useCustomFoods());
    await waitFor(() => expect(result.current.state).toBe("ready"));

    const added = [...FOODS, { ...FOODS[0], _id: "new", name: "Fresh Food" }];
    mockFetch.mockResolvedValue(ok(added));

    await act(async () => {
      await result.current.save({
        name: "Fresh Food",
        cat: "Protein",
        unit: "g",
        defaultQty: 100,
        per100: { kcal: 100, pro: 10, carb: 5, fat: 2 },
        barcode: null,
      });
    });

    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(result.current.foods.map((f) => f.name)).toContain("Fresh Food");
  });

  it("refetches after a delete", async () => {
    const { result } = renderHook(() => useCustomFoods());
    await waitFor(() => expect(result.current.state).toBe("ready"));

    mockFetch.mockResolvedValue(ok([FOODS[0]]));
    await act(async () => {
      await result.current.remove(FOODS[1]._id);
    });

    expect(mockDelete).toHaveBeenCalledWith(FOODS[1]._id);
    expect(result.current.foods).toEqual([FOODS[0]]);
  });

  it("surfaces a 42P10 conflict without losing the list", async () => {
    // Phase 5's manual add-food always upserts on `name` (R1 strips barcode),
    // and PHASE-2-DECISIONS §9 records that branch as never having run against
    // real data. If the unique index is missing this is exactly what comes back,
    // and the form has to be able to say so.
    const { result } = renderHook(() => useCustomFoods());
    await waitFor(() => expect(result.current.state).toBe("ready"));

    mockSave.mockResolvedValue(
      fail("conflict", 'there is no unique constraint matching the ON CONFLICT specification'),
    );

    let returned: Result<CustomFood> | undefined;
    await act(async () => {
      returned = await result.current.save({
        name: "Fresh Food",
        cat: "Protein",
        unit: "g",
        defaultQty: 100,
        per100: { kcal: 100, pro: 10, carb: 5, fat: 2 },
        barcode: null,
      });
    });

    expect(returned?.ok).toBe(false);
    expect(result.current.state).toBe("ready");
    expect(result.current.error).toBeNull();
    expect(result.current.foods).toEqual(FOODS);
  });
});
