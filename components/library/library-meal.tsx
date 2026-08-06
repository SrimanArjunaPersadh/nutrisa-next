"use client";

/**
 * One saved meal in the library, with its gram editor. Ports the meal card at
 * 3157–3178, `ingEditor` (708) and `logCustomG` (685).
 *
 * The editor is the SAME arithmetic as the logged-meal editor in Phase 4 —
 * `scaleIngredients` / `sumIngredients` / `toStoredIngredients` — because it is
 * the same operation: a stored ingredient already carries its own macros for
 * its own quantity, so re-portioning is pure proportion and never touches
 * `FOOD_DB` (`lib/engine/ingredients.ts`).
 *
 * WHAT IT DOES NOT DO: it never writes back to `custom_meals`. Editing grams
 * here changes what gets LOGGED, not what is saved — exactly as `logCustomG`
 * behaves, and as the old app's `resetGCustom` (which throws the overrides away)
 * confirms. To change the saved definition you rebuild it in the builder.
 */

import { useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";

import type { CustomMeal, StoredIngredient } from "@/lib/data";
import {
  baseQty,
  scaleIngredients,
  sumIngredients,
  toStoredIngredients,
} from "@/lib/engine/ingredients";
import type { Macros } from "@/lib/engine/types";

export type LibraryMealProps = {
  meal: CustomMeal;
  open: boolean;
  onToggle: () => void;
  /** Log to TODAY at the current (possibly edited) quantities. */
  onLog: (
    meal: CustomMeal,
    macros: Macros,
    ings: readonly StoredIngredient[] | null,
  ) => void;
  onDelete: (meal: CustomMeal) => void;
  logging: boolean;
  deleting: boolean;
};

/**
 * `custom_meals` quantities carry a unit suffix (`"80g"`); the editor and
 * `meal_logs` both want bare numbers. Old app 713–717, `|| 100` included.
 */
function baseIngredients(meal: CustomMeal): readonly StoredIngredient[] {
  return meal.ingredients.map((ing) => ({
    ...ing,
    qty: String(parseFloat(ing.qty) || 100),
  }));
}

export function LibraryMeal({
  meal,
  open,
  onToggle,
  onLog,
  onDelete,
  logging,
  deleting,
}: LibraryMealProps) {
  const base = baseIngredients(meal);

  /** Sparse quantity overrides — the old app's `S.gO`, as state (Phase 4 §3a). */
  const [qty, setQty] = useState<(number | undefined)[]>([]);

  const scaled = scaleIngredients(base, qty);
  const total = sumIngredients(scaled);
  const dirty = qty.some((q, i) => q !== undefined && q !== baseQty(base[i]));

  function logIt() {
    if (base.length === 0) {
      // No breakdown to scale: log the meal's stored macros as they are.
      onLog(meal, { kcal: meal.kcal, pro: meal.pro, carb: meal.carb, fat: meal.fat }, null);
      return;
    }
    onLog(meal, total, toStoredIngredients(scaled));
  }

  return (
    <li className="rounded-card border border-border bg-bg3">
      <div className="flex items-center gap-2 p-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body font-medium text-text">
              {meal.name}
            </span>
            <span
              className="mt-0.5 flex flex-wrap gap-x-2 text-label text-text-3"
              data-numeric
            >
              <span>{Math.round(meal.kcal)} kcal</span>
              <span className="text-protein">{Math.round(meal.pro)}g P</span>
              <span className="text-carbs">{Math.round(meal.carb)}g C</span>
              <span className="text-fats">{Math.round(meal.fat)}g F</span>
            </span>
          </span>
          <ChevronDown
            size={16}
            aria-hidden
            className={`shrink-0 text-text-3 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>

        <button
          type="button"
          onClick={logIt}
          disabled={logging}
          aria-label={`Log ${meal.name} to today`}
          className="grid size-11 shrink-0 place-items-center rounded-btn bg-blue text-text transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Plus size={18} aria-hidden />
        </button>

        <button
          type="button"
          onClick={() => onDelete(meal)}
          disabled={deleting}
          aria-label={`Delete ${meal.name}`}
          className="grid size-11 shrink-0 place-items-center rounded-btn text-text-3 transition-colors hover:text-red disabled:opacity-40"
        >
          <Trash2 size={15} aria-hidden />
        </button>
      </div>

      {open && (
        <div className="border-t border-border p-3">
          {meal.note && (
            <p className="mb-2 text-label text-text-3">{meal.note}</p>
          )}

          {base.length === 0 ? (
            <p className="text-label text-text-3">
              No ingredient breakdown saved for this meal.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-label">
                  <thead>
                    <tr className="text-text-3">
                      <th className="pb-1 text-left font-medium">Ingredient</th>
                      <th className="pb-1 text-right font-medium">Qty</th>
                      <th className="pb-1 text-right font-medium">Kcal</th>
                      <th className="pb-1 text-right font-medium text-protein">P</th>
                      <th className="pb-1 text-right font-medium text-carbs">C</th>
                      <th className="pb-1 text-right font-medium text-fats">F</th>
                    </tr>
                  </thead>
                  <tbody>
                    {base.map((ing, i) => (
                      <tr key={`${ing.name}-${i}`} className="border-t border-border">
                        <td className="py-1.5 pr-2 text-text-2">{ing.name}</td>
                        <td className="py-1.5">
                          <input
                            type="number"
                            min={0}
                            /* The old app hardcodes step 5 here (725). A saved
                               meal's stored qty is a bare number with no unit
                               attached — there is no food record to ask — so
                               `unitStep` has nothing to read and 5 stands. */
                            step={5}
                            value={qty[i] ?? baseQty(ing)}
                            onChange={(e) => {
                              const value = parseFloat(e.target.value) || 0;
                              setQty((prev) => {
                                const next = [...prev];
                                next[i] = value;
                                return next;
                              });
                            }}
                            aria-label={`${ing.name} quantity`}
                            className="min-h-11 w-16 rounded-btn border border-border bg-bg2 px-2 text-right text-body text-text"
                            data-numeric
                          />
                        </td>
                        <td className="py-1.5 text-right text-text" data-numeric>
                          {scaled[i].kcal}
                        </td>
                        <td className="py-1.5 text-right text-protein" data-numeric>
                          {Math.round(scaled[i].pro)}g
                        </td>
                        <td className="py-1.5 text-right text-carbs" data-numeric>
                          {Math.round(scaled[i].carb)}g
                        </td>
                        <td className="py-1.5 text-right text-fats" data-numeric>
                          {Math.round(scaled[i].fat)}g
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
                <span className="text-label uppercase text-text-3">Meal total</span>
                <span className="text-label" data-numeric>
                  <b className="text-text">{total.kcal} kcal</b> ·{" "}
                  <span className="text-protein">{Math.round(total.pro)}g P</span> ·{" "}
                  <span className="text-carbs">{Math.round(total.carb)}g C</span> ·{" "}
                  <span className="text-fats">{Math.round(total.fat)}g F</span>
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setQty([])}
                  disabled={!dirty}
                  className="min-h-11 rounded-btn border border-border px-3 text-label text-text-2 disabled:opacity-40"
                >
                  ↺ Reset
                </button>
                <button
                  type="button"
                  onClick={logIt}
                  disabled={logging}
                  className="min-h-11 rounded-btn bg-blue px-4 text-label font-semibold text-text transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {logging ? "Logging…" : "+ Log to Today"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </li>
  );
}
