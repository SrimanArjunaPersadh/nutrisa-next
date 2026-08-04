"use client";

/**
 * The day's logged meals. Ports the rows at 2757–2775.
 *
 * PHASE 4 SCOPE (§3): a row shows its name, time, kcal and macro line, and can
 * be deleted. Tapping it does NOT expand — the ingredient/gram editor
 * (`loggedItemEditor`) is Phase 5, where Plan §5.4 puts the gram editor and its
 * `unitType` handling. A row that opened onto nothing would be worse than a row
 * that does not open.
 *
 * Delete is a single tap with an Undo toast, never a confirm — the Phase 3 §6
 * precedent. The caller owns the toast; this component just reports the tap.
 */

import { Trash2 } from "lucide-react";

import type { LoggedMeal } from "@/lib/data";

export type LoggedListProps = {
  meals: readonly LoggedMeal[];
  onDelete: (meal: LoggedMeal) => void;
  /** `_id` of the row currently being deleted, so its button can show it. */
  deleting: string | null;
};

export function LoggedList({ meals, onDelete, deleting }: LoggedListProps) {
  return (
    <ul>
      {meals.map((meal) => {
        const busy = deleting !== null && deleting === meal._id;

        return (
          <li
            key={meal._id ?? `${meal.name}-${meal.sortOrder}`}
            className="flex items-center gap-3 border-b border-border py-2.5 last:border-b-0"
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
              {/* Macro colours are reserved (§4): protein owns --protein. Carbs
                  and fat stay tertiary here so one row does not become a
                  rainbow — the old app did the same (2768). */}
              <div className="text-label text-text-3" data-numeric>
                <span className="text-protein">{Math.round(meal.pro)}g P</span> ·{" "}
                {Math.round(meal.carb)}g C · {Math.round(meal.fat)}g F
              </div>
            </div>

            <button
              type="button"
              onClick={() => onDelete(meal)}
              disabled={busy}
              aria-label={`Delete ${meal.name}`}
              className="grid min-h-11 w-11 place-items-center rounded-btn text-text-3 transition-colors hover:text-red disabled:opacity-40"
            >
              <Trash2 size={16} aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
