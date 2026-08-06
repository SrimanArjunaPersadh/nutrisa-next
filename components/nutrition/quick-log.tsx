"use client";

/**
 * Quick Log — log raw ingredients without building a meal first. Ports
 * `qlRenderWidget` (2311), `qlAddIng` (2197), `qlRenderRows` (2237) and
 * `qlLogAll` (2270).
 *
 * The meal builder saves a definition you reuse; this logs one-off food and
 * keeps nothing. Same composer underneath (`useComposer`), same search box,
 * same arithmetic — the only real difference is where the total ends up.
 */

import { useState } from "react";
import { Trash2, Zap } from "lucide-react";

import { FoodSearch } from "@/components/library/food-search";
import type { StoredIngredient } from "@/lib/data";
import { isFlagged, type SearchableFood } from "@/lib/food-db";
import type { Macros } from "@/lib/engine/types";
import { composerQty, useComposer } from "@/lib/hooks/useComposer";
import { unitDisplayLabel, unitMin, unitStep } from "@/lib/units";

export type QuickLogProps = {
  pool: readonly SearchableFood[];
  /** Logs onto the day the page is showing. Resolves once reported. */
  onLog: (
    name: string,
    macros: Macros,
    ings: readonly StoredIngredient[],
  ) => Promise<boolean>;
};

/**
 * The name a Quick Log entry gets when you do not type one. Old app 2281–2283.
 *
 * One ingredient → `"Banana (1piece)"`. More than one → each food's FIRST WORD
 * with its quantity, comma-separated: `"Rolled 80g, Clover 250ml"`. The
 * abbreviation is the old app's and it is what makes a multi-item Quick Log fit
 * on one line of the day list.
 */
export function autoName(
  rows: readonly { food: SearchableFood; qty: number }[],
): string {
  if (rows.length === 1) {
    const only = rows[0];
    return `${only.food.name} (${only.qty}${only.food.unit})`;
  }
  return rows
    .map((row) => `${row.food.name.split(" ")[0]} ${row.qty}${row.food.unit}`)
    .join(", ");
}

export function QuickLog({ pool, onLog }: QuickLogProps) {
  const composer = useComposer();
  const [name, setName] = useState("");
  const [logging, setLogging] = useState(false);

  async function logAll() {
    if (composer.rows.length === 0 || logging) return;

    setLogging(true);
    const ok = await onLog(
      name.trim() || autoName(composer.rows),
      composer.total,
      // `qty` as a BARE number string — the `meal_logs` convention
      // (PHASE-2-DECISIONS §12 finding 5). Old app 2288–2295.
      composer.views.map((view) => ({
        name: view.food.name,
        qty: String(view.qty),
        kcal: view.macros.kcal,
        pro: view.macros.pro,
        carb: view.macros.carb,
        fat: view.macros.fat,
      })),
    );
    setLogging(false);

    // Only a successful log clears the rows. A failed one keeps them, so the
    // retry is one tap and not a re-entry of everything (§4.4).
    if (ok) {
      composer.clear();
      setName("");
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-btn bg-blue text-text"
        >
          <Zap size={15} />
        </span>
        <div>
          <h2 className="font-display text-card text-text">Quick Log</h2>
          <p className="text-label text-text-3">
            Search any ingredient · no meal name needed
          </p>
        </div>
      </div>

      {composer.warning && (
        <p
          role="status"
          className="mt-3 rounded-btn border border-amber/40 px-3 py-2 text-label text-amber"
        >
          {composer.warning}
        </p>
      )}

      <div className="mt-3">
        <FoodSearch
          pool={pool}
          onSelect={composer.add}
          placeholder="Search ingredient (e.g. Greek yoghurt, banana, whey…)"
          ariaLabel="Search an ingredient to log"
        />
      </div>

      {composer.rows.length > 0 && (
        <>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-label">
              <thead>
                <tr className="text-text-3">
                  <th className="pb-1 text-left font-medium">Ingredient</th>
                  <th className="pb-1 text-right font-medium">Qty</th>
                  <th className="pb-1 text-right font-medium">Kcal</th>
                  <th className="pb-1 text-right font-medium text-protein">P</th>
                  <th className="pb-1 text-right font-medium text-carbs">C</th>
                  <th className="pb-1 text-right font-medium text-fats">F</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {composer.views.map((view, i) => (
                  <tr
                    key={`${view.food.name}-${i}`}
                    className="border-t border-border"
                  >
                    <td className="py-1.5 pr-2">
                      <span
                        className={
                          isFlagged(view.food.name) ? "text-amber" : "text-text-2"
                        }
                      >
                        {view.food.name}
                        {isFlagged(view.food.name) && " ⚠️"}
                      </span>
                    </td>
                    <td className="py-1.5">
                      <span className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          min={unitMin()}
                          step={unitStep(view.food)}
                          value={view.qty}
                          onChange={(e) =>
                            composer.setQty(i, composerQty(e.target.value))
                          }
                          aria-label={`${view.food.name} quantity`}
                          className="min-h-11 w-16 rounded-btn border border-border bg-bg2 px-2 text-right text-body text-text"
                          data-numeric
                        />
                        <span className="min-w-8 whitespace-nowrap text-text-3">
                          {unitDisplayLabel(view.food, view.qty)}
                        </span>
                      </span>
                    </td>
                    <td className="py-1.5 text-right text-text" data-numeric>
                      {view.macros.kcal}
                    </td>
                    <td className="py-1.5 text-right text-protein" data-numeric>
                      {view.macros.pro}g
                    </td>
                    <td className="py-1.5 text-right text-carbs" data-numeric>
                      {view.macros.carb}g
                    </td>
                    <td className="py-1.5 text-right text-fats" data-numeric>
                      {view.macros.fat}g
                    </td>
                    <td className="py-1.5 pl-1 text-right">
                      <button
                        type="button"
                        onClick={() => composer.remove(i)}
                        aria-label={`Remove ${view.food.name}`}
                        className="grid size-8 place-items-center rounded-btn text-text-3 transition-colors hover:text-red"
                      >
                        <Trash2 size={13} aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
            <span className="text-label uppercase text-text-3">Total</span>
            <span className="text-label" data-numeric>
              <b className="text-text">{composer.total.kcal} kcal</b> ·{" "}
              <span className="text-protein">{composer.total.pro}g P</span> ·{" "}
              <span className="text-carbs">{composer.total.carb}g C</span> ·{" "}
              <span className="text-fats">{composer.total.fat}g F</span>
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name this meal (optional)"
              aria-label="Name this Quick Log entry"
              className="min-h-11 min-w-36 flex-1 rounded-btn border border-border bg-bg2 px-2 text-body text-text placeholder:text-text-3"
            />
            <button
              type="button"
              onClick={composer.clear}
              disabled={logging}
              className="min-h-11 rounded-btn border border-border px-3 text-label text-text-2 disabled:opacity-40"
            >
              ✕ Clear
            </button>
            <button
              type="button"
              onClick={() => void logAll()}
              disabled={logging}
              className="min-h-11 rounded-btn bg-blue px-4 text-label font-semibold text-text transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {logging ? "Logging…" : "+ Log to Today"}
            </button>
          </div>

          <p className="mt-1.5 text-label text-text-3">
            {name.trim() ? "Logs as" : "Will log as"} “
            {name.trim() || autoName(composer.rows)}”
          </p>
        </>
      )}
    </div>
  );
}
