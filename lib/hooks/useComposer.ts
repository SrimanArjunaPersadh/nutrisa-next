"use client";

/**
 * `useComposer()` — the rows-of-food-with-quantities state that the Meal
 * Builder, Quick Log and the logged editor's "Add Item" widget all share.
 *
 * The old app wrote this three times: `mbAddIng`/`mbRemoveIng`/`mbTotals`
 * (974–989), `qlAddIng`/`qlRemoveIng`/`qlTotals` (2197–2233) and
 * `logAddFood`/`logRemoveIng` (3442–3478). The three copies are the same
 * function with different DOM ids — and they had already drifted: only the meal
 * builder shows the flagged-food warning, and only it uses `unitStep` on the
 * quantity input. One implementation, three call sites, no drift.
 *
 * **This hook computes NOTHING itself.** Row macros come from
 * `macrosForQuantity` and the total from `sumIngredients`, both in
 * `lib/engine/` and both oracle-tested. Plan §6: the surface holds state, the
 * engine does arithmetic.
 */

import { useCallback, useMemo, useState } from "react";

import { isUsableFood, isSameFood } from "@/lib/food-search";
import { FLAGGED_FOODS, type SearchableFood } from "@/lib/food-db";
import { macrosForQuantity } from "@/lib/engine/macros";
import { sumIngredients } from "@/lib/engine/ingredients";
import type { Macros } from "@/lib/engine/types";

/** A food in the composer at a chosen quantity. The old app's `{f, qty}`. */
export type ComposerRow = {
  readonly food: SearchableFood;
  readonly qty: number;
};

/** A row plus the macros for its current quantity. */
export type ComposerRowView = ComposerRow & { readonly macros: Macros };

export type Composer = {
  readonly rows: readonly ComposerRow[];
  /** Rows with their computed macros, in row order. */
  readonly views: readonly ComposerRowView[];
  /** The composer total, via the oracle-tested `sumIngredients`. */
  readonly total: Macros;
  /**
   * Add a food, or top up the row it is already on. Returns `false` — and
   * changes nothing — for a food whose macro basis does not match its unit.
   *
   * That cannot happen from the search box, which filters those out before
   * they are ever offered (eng review D7). But `add` is a public entry point
   * and such a food makes `macrosForQuantity` THROW on the very next render,
   * which with no error boundary means a dead screen on the installed PWA.
   *
   * **It deliberately does NOT report added-vs-topped-up.** Working that out
   * requires reading the current rows, and the only correct place to read them
   * is inside the `setRows` updater — whose return value cannot escape, and
   * whose body React may run later or more than once. A value assigned in
   * there and returned from here is stale by construction. No caller needs the
   * distinction, so the honest signature is the one that cannot lie.
   */
  readonly add: (food: SearchableFood) => boolean;
  readonly remove: (index: number) => void;
  readonly setQty: (index: number, qty: number) => void;
  readonly clear: () => void;
  /** The off-plan warning raised by the last flagged food added, if any. */
  readonly warning: string | null;
  readonly dismissWarning: () => void;
};

export function useComposer(): Composer {
  const [rows, setRows] = useState<readonly ComposerRow[]>([]);
  const [warning, setWarning] = useState<string | null>(null);

  const add = useCallback((food: SearchableFood): boolean => {
    if (!isUsableFood(food)) return false;

    // Old app 975–979: the warning appears and then STAYS until the card is
    // re-rendered. Kept — it is about the meal you are building, not about the
    // tap, so it should outlive the tap.
    const flag = FLAGGED_FOODS[food.name];
    if (flag) setWarning(flag);

    setRows((prev) => {
      // Identity, NOT name (eng review D6). A custom food called "Banana" and
      // the built-in Banana are two foods with two sets of macros; collapsing
      // them by name silently uses one food's numbers for both.
      const at = prev.findIndex((row) => isSameFood(row.food, food));

      if (at === -1) {
        // `|| 100` — old app 982.
        return [...prev, { food, qty: food.defaultQty || 100 }];
      }

      const next = [...prev];
      // `|| 5` on a top-up where a NEW row falls back to 100 (old app 981).
      // The asymmetry is the old app's and is carried forward: a food with no
      // default quantity starts at 100 but grows by 5.
      next[at] = { ...next[at], qty: next[at].qty + (food.defaultQty || 5) };
      return next;
    });

    return true;
  }, []);

  const remove = useCallback((index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const setQty = useCallback((index: number, qty: number) => {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, qty } : row)),
    );
  }, []);

  const clear = useCallback(() => {
    setRows([]);
    setWarning(null);
  }, []);

  const dismissWarning = useCallback(() => setWarning(null), []);

  const views = useMemo(
    () =>
      rows.map((row) => ({
        ...row,
        macros: macrosForQuantity(row.food, row.qty),
      })),
    [rows],
  );

  // `sumIngredients` IS the old app's `mbTotals`/`qlTotals` accumulator — same
  // seed, same 1 dp fed forward, same refusal to round kcal per step. Widened
  // to `Macros[]` in Phase 5 (R7) precisely so this could reuse it rather than
  // grow a twin that drifts.
  const total = useMemo(
    () => sumIngredients(views.map((v) => v.macros)),
    [views],
  );

  return useMemo(
    () => ({
      rows,
      views,
      total,
      add,
      remove,
      setQty,
      clear,
      warning,
      dismissWarning,
    }),
    [rows, views, total, add, remove, setQty, clear, warning, dismissWarning],
  );
}

/**
 * The quantity coercion every composer input uses. Old app 960 / 1057:
 * `const v = parseFloat(el.value); ing.qty = isNaN(v)||v<0 ? 0 : v;`
 *
 * An empty or negative box reads as ZERO, not as "leave it alone" — so the
 * totals visibly fall and you can see what you are about to save. Exported
 * because all three composers share it and because it is worth testing once.
 */
export function composerQty(raw: string): number {
  const value = parseFloat(raw);
  return Number.isNaN(value) || value < 0 ? 0 : value;
}
