"use client";

/**
 * The Saved Meals picker. Ports the library list at 2800–2840, minus search.
 *
 * PHASE 4 SCOPE (§4): grouped by category with a `+` to log. NO search box, so
 * NO custom dropdown, so the dropdown rule is not exercised in this phase — that
 * is Phase 5's first order of business. NO drag handles either: the old app's
 * `draggable`/`ondragstart` was HTML5 DnD, which never fired on touch (§5).
 *
 * The `+` button ports `qadd()` (3561–3583) — including its two details that are
 * easy to lose:
 *   • `_libId` is the meal's NAME, not its id. The old app is explicit about why
 *     (3564): a UUID changes if a meal is deleted and recreated; a name does not.
 *   • ingredient `qty` is normalised to a BARE number string. `custom_meals`
 *     stores `"80g"` and `meal_logs` stores `"80"` — two tables, two conventions
 *     (PHASE-2-DECISIONS §12 finding 5) — and `qadd` converts between them with
 *     `String(parseFloat(ing.qty) || 100)`. The `|| 100` fallback is carried
 *     forward as-is.
 */

import { Plus } from "lucide-react";

import type { CustomMeal, StoredIngredient } from "@/lib/data";
import { groupByCategory } from "@/lib/meal-categories";

export type SavedMealsProps = {
  meals: readonly CustomMeal[];
  onLog: (meal: CustomMeal) => void;
  /** Name of the meal currently being logged, so its button can show it. */
  logging: string | null;
};

/**
 * `custom_meals.ingredients` → `meal_logs.ings_json` shape. Old app 3566–3576.
 *
 * Exported because the Phase 4 page needs it and Phase 5's editor will too.
 */
export function toLoggedIngredients(
  meal: CustomMeal,
): readonly StoredIngredient[] | null {
  if (!meal.ingredients.length) return null;

  return meal.ingredients.map((ing) => ({
    name: ing.name,
    // "80g" → "80". The `|| 100` is the old app's, quirk included.
    qty: String(parseFloat(ing.qty) || 100),
    kcal: ing.kcal,
    pro: ing.pro,
    carb: ing.carb,
    fat: ing.fat,
  }));
}

export function SavedMeals({ meals, onLog, logging }: SavedMealsProps) {
  const groups = groupByCategory(meals);

  return (
    <div className="grid gap-4">
      {groups.map(({ cat, meals: inCat }) => (
        <section key={cat}>
          <h3 className="text-label font-medium uppercase text-text-3">{cat}</h3>
          <ul className="mt-1.5 grid gap-1.5">
            {inCat.map((meal) => (
              <li
                key={meal._id}
                className="flex items-center gap-3 rounded-card border border-border bg-bg3 p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body font-medium text-text">
                    {meal.name}
                  </div>
                  <div
                    className="mt-0.5 flex flex-wrap gap-x-2 text-label text-text-3"
                    data-numeric
                  >
                    <span>{Math.round(meal.kcal)} kcal</span>
                    <span className="text-protein">{Math.round(meal.pro)}g P</span>
                    <span className="text-carbs">{Math.round(meal.carb)}g C</span>
                    <span className="text-fats">{Math.round(meal.fat)}g F</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onLog(meal)}
                  disabled={logging !== null}
                  aria-label={`Log ${meal.name}`}
                  className="grid size-11 shrink-0 place-items-center rounded-btn bg-blue text-text transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  <Plus size={18} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
