"use client";

/**
 * The day's logged meals. Ports the rows at 2757–2775.
 *
 * A row expands into the gram editor (`MealEditor`), which was pulled forward
 * from Phase 5 at the owner's request (PHASE-4-DECISIONS §3a). One row is open
 * at a time — the old app tracked `S.openCards['log_'+i]` per row and allowed
 * several, but on a phone a second open editor just pushes the first off screen.
 *
 * Delete stays a single tap with an Undo toast, never a confirm — the Phase 3 §6
 * precedent. The caller owns the toast; this component reports the tap.
 */

import { ChevronDown, Trash2 } from "lucide-react";

import { MealEditor } from "@/components/nutrition/meal-editor";
import type { CustomMeal, LoggedMeal, StoredIngredient } from "@/lib/data";
import type { Macros } from "@/lib/engine/types";

export type LoggedListProps = {
  meals: readonly LoggedMeal[];
  onDelete: (meal: LoggedMeal) => void;
  /** `_id` of the row currently being deleted, so its button can show it. */
  deleting: string | null;
  /** `_id` of the open row, or null. Owned by the page so a refetch cannot reopen one. */
  openId: string | null;
  onToggle: (id: string | null) => void;
  library: readonly CustomMeal[];
  onSave: (
    meal: LoggedMeal,
    macros: Macros,
    ings?: readonly StoredIngredient[] | null,
  ) => Promise<void>;
  /** `_id` of the row currently saving. */
  saving: string | null;
};

export function LoggedList({
  meals,
  onDelete,
  deleting,
  openId,
  onToggle,
  library,
  onSave,
  saving,
}: LoggedListProps) {
  return (
    <ul>
      {meals.map((meal) => {
        const id = meal._id ?? null;
        const open = id !== null && id === openId;
        const busy = deleting !== null && deleting === id;

        return (
          <li
            key={id ?? `${meal.name}-${meal.sortOrder}`}
            className="border-b border-border last:border-b-0"
          >
            <div className="flex items-center gap-3 py-2.5">
              {/* The whole row is the disclosure control — a 44px target that
                  spans the row beats a chevron you have to hit exactly (§1.4).
                  A meal with no id was never written and cannot be edited. */}
              <button
                type="button"
                onClick={() => onToggle(open ? null : id)}
                disabled={id === null}
                aria-expanded={open}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body font-medium text-text">
                    {meal.name}
                  </div>
                  {meal.time && (
                    <div className="text-label text-text-3" data-numeric>
                      {meal.time}
                    </div>
                  )}
                </div>

                <div className="text-right">
                  <div className="font-display text-card text-text" data-numeric>
                    {meal.kcal}
                    <span className="ml-0.5 text-label font-normal not-italic text-text-3">
                      kcal
                    </span>
                  </div>
                  {/* Macro colours are reserved (§4): protein owns --protein.
                      Carbs and fat stay tertiary so one row is not a rainbow —
                      the old app did the same (2768). */}
                  <div className="text-label text-text-3" data-numeric>
                    <span className="text-protein">{Math.round(meal.pro)}g P</span>{" "}
                    · {Math.round(meal.carb)}g C · {Math.round(meal.fat)}g F
                  </div>
                </div>

                {id !== null && (
                  <ChevronDown
                    size={14}
                    aria-hidden
                    className={`shrink-0 text-text-3 transition-transform ${open ? "rotate-180" : ""}`}
                  />
                )}
              </button>

              <button
                type="button"
                onClick={() => onDelete(meal)}
                disabled={busy}
                aria-label={`Delete ${meal.name}`}
                className="grid min-h-11 w-11 shrink-0 place-items-center rounded-btn text-text-3 transition-colors hover:text-red disabled:opacity-40"
              >
                <Trash2 size={16} aria-hidden />
              </button>
            </div>

            {open && (
              <div className="pb-3">
                <MealEditor
                  meal={meal}
                  library={library}
                  saving={saving === id}
                  onCancel={() => onToggle(null)}
                  onSave={(macros, ings) => onSave(meal, macros, ings)}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
