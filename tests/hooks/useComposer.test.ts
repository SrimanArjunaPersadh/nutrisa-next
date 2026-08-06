// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FOOD_DB, type SearchableFood } from "@/lib/food-db";
import { composerQty, useComposer } from "@/lib/hooks/useComposer";

/**
 * The composer's job is to hold rows and hand them to the engine. So what is
 * worth testing here is NOT the arithmetic — `macrosForQuantity` and
 * `sumIngredients` are already oracle-tested — but the three things the old app
 * did that a clean rewrite would quietly "fix":
 *
 *   1. the `|| 100` / `|| 5` asymmetry between a new row and a top-up,
 *   2. identity by `_id` rather than by name (eng review D6),
 *   3. `parseFloat(v); isNaN||v<0 ? 0 : v` on the quantity input.
 *
 * Each of those is a silent wrong-number bug if it drifts, and none of them
 * would look wrong on screen.
 */

const byName = (name: string): SearchableFood => {
  const food = FOOD_DB.find((f) => f.name === name);
  if (!food) throw new Error(`fixture missing: ${name}`);
  return food;
};

/** g-basis, defaultQty 150. */
const TOFU = byName("Vejoy Tofu");
/** per-unit, defaultQty 1, unit "scoop". */
const WHEY = byName("Vanilla Whey Protein");
/** Flagged off-plan. */
const OLIVE_OIL = byName("Olive Oil");

describe("useComposer — adding", () => {
  it("starts a new row at the food's defaultQty", () => {
    const { result } = renderHook(() => useComposer());

    act(() => {
      result.current.add(TOFU);
    });

    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0].qty).toBe(150);
    expect(result.current.rows[0].food.name).toBe("Vejoy Tofu");
  });

  it("tops up an existing row instead of duplicating it", () => {
    const { result } = renderHook(() => useComposer());

    act(() => {
      result.current.add(TOFU);
    });
    act(() => {
      result.current.add(TOFU);
    });

    expect(result.current.rows).toHaveLength(1);
    // 150 + 150 — the top-up uses defaultQty when there is one (old app 981).
    expect(result.current.rows[0].qty).toBe(300);
  });

  it("accepts a usable food", () => {
    const { result } = renderHook(() => useComposer());

    let accepted: boolean | undefined;
    act(() => {
      accepted = result.current.add(TOFU);
    });

    expect(accepted).toBe(true);
  });

  it("falls back to 100 on a NEW row and 5 on a TOP-UP — the old app's asymmetry", () => {
    // A food with no usable defaultQty. `0 || 100` is 100; `0 || 5` is 5.
    const noDefault: SearchableFood = { ...TOFU, defaultQty: 0 };
    const { result } = renderHook(() => useComposer());

    act(() => {
      result.current.add(noDefault);
    });
    expect(result.current.rows[0].qty).toBe(100);

    act(() => {
      result.current.add(noDefault);
    });
    // 100 + 5, NOT 100 + 100. Carried forward from old app 981/982 verbatim.
    expect(result.current.rows[0].qty).toBe(105);
  });

  it("keeps a custom food and a built-in of the SAME NAME apart (D6)", () => {
    // The exact collision the old app's `i.f.name === food.name` merges: one
    // row, one set of macros, silently used for both foods.
    const impostor: SearchableFood & { _id: string } = {
      ...TOFU,
      _id: "custom-1",
      per100: { kcal: 999, pro: 99, carb: 99, fat: 99 },
    };

    const { result } = renderHook(() => useComposer());
    act(() => {
      result.current.add(TOFU);
    });
    act(() => {
      result.current.add(impostor);
    });

    expect(result.current.rows).toHaveLength(2);
    expect(result.current.views[0].macros.kcal).not.toBe(
      result.current.views[1].macros.kcal,
    );
  });

  it("refuses a food whose macro basis does not match its unit", () => {
    // `macrosForQuantity` THROWS on this shape. Before D7 that was a dead
    // screen on the installed PWA, with no error boundary to catch it.
    const broken = { ...TOFU, per100: undefined } as unknown as SearchableFood;
    const { result } = renderHook(() => useComposer());

    let accepted: boolean | undefined;
    act(() => {
      accepted = result.current.add(broken);
    });

    expect(accepted).toBe(false);
    expect(result.current.rows).toHaveLength(0);
  });

  it("raises the off-plan warning for a flagged food, and keeps it up", () => {
    const { result } = renderHook(() => useComposer());

    act(() => {
      result.current.add(OLIVE_OIL);
    });
    expect(result.current.warning).toContain("off-plan");

    // Adding something innocent does not clear it — the warning is about the
    // meal, not about the tap (old app 975–979).
    act(() => {
      result.current.add(TOFU);
    });
    expect(result.current.warning).toContain("off-plan");

    act(() => {
      result.current.dismissWarning();
    });
    expect(result.current.warning).toBeNull();
  });
});

describe("useComposer — rows and totals", () => {
  it("computes each row through the engine, on the right basis", () => {
    const { result } = renderHook(() => useComposer());

    act(() => {
      result.current.add(TOFU); // g → per100 × qty/100
    });
    act(() => {
      result.current.add(WHEY); // scoop → perUnit × qty
    });

    // 220 × 1.5 = 330; whey is 132 for one scoop.
    expect(result.current.views[0].macros.kcal).toBe(330);
    expect(result.current.views[1].macros.kcal).toBe(132);
  });

  it("totals with the running 1 dp accumulator, not a plain sum", () => {
    const { result } = renderHook(() => useComposer());

    act(() => {
      result.current.add(TOFU);
    });
    act(() => {
      result.current.add(WHEY);
    });

    // 330 + 132; protein 18.9 + 27.
    expect(result.current.total.kcal).toBe(462);
    expect(result.current.total.pro).toBe(45.9);
  });

  it("setQty re-computes the row and the total", () => {
    const { result } = renderHook(() => useComposer());

    act(() => {
      result.current.add(TOFU);
    });
    act(() => {
      result.current.setQty(0, 100);
    });

    expect(result.current.views[0].macros.kcal).toBe(220);
    expect(result.current.total.kcal).toBe(220);
  });

  it("remove drops exactly one row, by index", () => {
    const { result } = renderHook(() => useComposer());

    act(() => {
      result.current.add(TOFU);
    });
    act(() => {
      result.current.add(WHEY);
    });
    act(() => {
      result.current.remove(0);
    });

    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0].food.name).toBe("Vanilla Whey Protein");
  });

  it("clear empties the rows and the warning together", () => {
    const { result } = renderHook(() => useComposer());

    act(() => {
      result.current.add(OLIVE_OIL);
    });
    act(() => {
      result.current.clear();
    });

    expect(result.current.rows).toHaveLength(0);
    expect(result.current.warning).toBeNull();
    expect(result.current.total).toEqual({ kcal: 0, pro: 0, carb: 0, fat: 0 });
  });
});

describe("composerQty — the old app's input coercion", () => {
  it("reads a number", () => {
    expect(composerQty("80")).toBe(80);
    expect(composerQty("1.5")).toBe(1.5);
  });

  it("reads an empty box as ZERO, not as unchanged", () => {
    // This is what makes the totals fall to zero so you can SEE what you are
    // about to save (old app 960).
    expect(composerQty("")).toBe(0);
    expect(composerQty("abc")).toBe(0);
  });

  it("clamps a negative to zero", () => {
    expect(composerQty("-5")).toBe(0);
  });

  it("takes the leading number, as parseFloat does", () => {
    expect(composerQty("80g")).toBe(80);
  });
});
