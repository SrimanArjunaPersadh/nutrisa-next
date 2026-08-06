"use client";

/**
 * The Meal Builder. Ports `mbRenderBuilder` (1093), `mbRenderRows` (991) and
 * `mbSave` (1054).
 *
 * Search an ingredient, tap it, adjust the quantity, watch the macros update,
 * save it to the library. This is Plan §5.4's "live macro calc" and it is the
 * reason Phase 5 exists.
 *
 * THREE OLD-APP `confirm()` CALLS ARE GONE, replaced by inline state:
 *   • zero-quantity rows (1066) → an amber line naming them, and the save
 *     button reads "Save anyway". You can see what you are about to store.
 *   • overwrite an existing name (1068) → a line saying which meal will be
 *     replaced, and the button reads "Overwrite".
 *   • "please enter a meal name" / "add at least one ingredient" (1063–1064)
 *     `alert()`s → a disabled button with the reason under it.
 * Phase 3 §6's ruling was about DELETE specifically, but its reasoning is the
 * same one: a modal on a phone taxes every save to guard against a rare
 * mistake, and it cannot be read at the moment it matters.
 */

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";

import { FoodSearch } from "@/components/library/food-search";
import type { CustomMeal, Result, StoredIngredient } from "@/lib/data";
import { isFlagged, type SearchableFood } from "@/lib/food-db";
import type { NewCustomMeal } from "@/lib/hooks/useCustomMeals";
import { composerQty, useComposer } from "@/lib/hooks/useComposer";
import { CATS } from "@/lib/meal-categories";
import { unitDisplayLabel, unitMin, unitStep } from "@/lib/units";

export type MealBuilderProps = {
  pool: readonly SearchableFood[];
  /** The library as it stands, for the overwrite check (old app 1067). */
  existing: readonly CustomMeal[];
  onSave: (meal: NewCustomMeal) => Promise<Result<CustomMeal>>;
  /** Fired after a successful save, for the page's toast. */
  onSaved: (name: string) => void;
};

/**
 * The meal the composer is about to become. Ports `mbSave`'s `newMeal`
 * (1072–1079).
 *
 * **`qty: ing.qty + "g"` REGARDLESS OF UNIT — the old app's quirk, carried
 * forward.** One scoop of whey is stored as `"1g"`, not `"1 scoop"`. It is a
 * wrong LABEL but not a wrong NUMBER: the row's macros are stored alongside it
 * for exactly that quantity, so `baseQty` reads back 1, the gram editor scales
 * from 1, and every figure stays correct. Every `custom_meals` row in the live
 * database was written this way, and those rows are the oracle (Plan §6).
 * Changing it here would make new rows disagree with old ones for no gain.
 */
function toStoredMeal(
  name: string,
  cat: string,
  note: string,
  views: ReturnType<typeof useComposer>["views"],
  total: ReturnType<typeof useComposer>["total"],
): NewCustomMeal {
  const ingredients: StoredIngredient[] = views.map((view) => ({
    name: view.food.name,
    qty: `${view.qty}g`,
    kcal: view.macros.kcal,
    pro: view.macros.pro,
    carb: view.macros.carb,
    fat: view.macros.fat,
  }));

  return {
    name,
    cat,
    // `notes || name` — the old app defaults the note to the meal name (1073).
    note: note || name,
    kcal: total.kcal,
    pro: total.pro,
    carb: total.carb,
    fat: total.fat,
    ingredients,
  };
}

export function MealBuilder({
  pool,
  existing,
  onSave,
  onSaved,
}: MealBuilderProps) {
  const composer = useComposer();

  const [name, setName] = useState("");
  const [cat, setCat] = useState<string>(CATS[0]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set once the user has seen the zero-quantity warning and saved anyway. */
  const [acknowledgedZero, setAcknowledgedZero] = useState(false);

  const trimmed = name.trim();

  /**
   * The meal this save would replace, matched case-insensitively as the old app
   * matches (1067).
   *
   * **The upsert targets `name` EXACTLY** (`lib/data/customMeals.ts`), so a save
   * typed as "my bowl" against a stored "My Bowl" would warn about an overwrite
   * and then quietly insert a SECOND row. The fix is one line at the save call:
   * write under the existing row's exact name. The warning and the write now
   * mean the same thing.
   */
  const clash = useMemo(
    () =>
      trimmed
        ? (existing.find(
            (m) => m.name.toLowerCase() === trimmed.toLowerCase(),
          ) ?? null)
        : null,
    [existing, trimmed],
  );

  const zeroRows = composer.views.filter((v) => v.qty === 0);
  /**
   * A zero row always says so and the button always reads "Save anyway"; the
   * acknowledgement only decides whether the NEXT press writes.
   *
   * The alternative — hiding the warning once acknowledged — makes the first
   * press look like it did nothing at all, which is worse than the modal it
   * replaced.
   */
  const needsAcknowledgement = zeroRows.length > 0 && !acknowledgedZero;

  const blocked =
    trimmed.length === 0
      ? "Give the meal a name to save it."
      : composer.rows.length === 0
        ? "Add at least one ingredient."
        : null;

  async function save() {
    if (blocked || saving) return;

    if (needsAcknowledgement) {
      // First press acknowledges, second press saves. This is the old app's
      // confirm(), unrolled into the button the thumb is already on.
      setAcknowledgedZero(true);
      return;
    }

    setSaving(true);
    setError(null);

    const meal = toStoredMeal(
      // The existing row's exact casing when overwriting — see `clash`.
      clash ? clash.name : trimmed,
      cat,
      note.trim(),
      composer.views,
      composer.total,
    );

    const result = await onSave(meal);
    setSaving(false);

    if (!result.ok) {
      // The form KEEPS its contents on failure. Clearing it would destroy the
      // meal the user just built to report that it was not stored (§4.4).
      setError(
        result.error.kind === "network"
          ? `Couldn’t reach the server — ${meal.name} was not saved.`
          : `Couldn’t save ${meal.name}: ${result.error.message}`,
      );
      return;
    }

    // Old app 1082: the builder resets to empty after a successful save.
    composer.clear();
    setName("");
    setCat(CATS[0]);
    setNote("");
    setAcknowledgedZero(false);
    onSaved(meal.name);
  }

  const saveLabel = saving
    ? "Saving…"
    : zeroRows.length > 0
      ? "Save anyway"
      : clash
        ? "Overwrite"
        : "Save to Library";

  return (
    <div className="grid gap-3">
      <p className="text-label uppercase tracking-wide text-text-2">
        Build your meal — ingredient by ingredient
      </p>

      {composer.warning && (
        <p
          role="status"
          className="rounded-btn border border-amber/40 px-3 py-2 text-label text-amber"
        >
          {composer.warning}
        </p>
      )}

      <FoodSearch
        pool={pool}
        onSelect={composer.add}
        ariaLabel="Search an ingredient to add to the meal"
      />

      {composer.rows.length === 0 ? (
        <p className="py-6 text-center text-body text-text-2">
          Search and add ingredients above to build your meal.
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
                  <th />
                </tr>
              </thead>
              <tbody>
                {composer.views.map((view, i) => {
                  const flagged = isFlagged(view.food.name);
                  return (
                    <tr
                      key={`${view.food.name}-${i}`}
                      className="border-t border-border"
                    >
                      <td className="py-1.5 pr-2">
                        <span
                          className={`block ${flagged ? "text-amber" : "text-text-2"}`}
                        >
                          {view.food.name}
                          {flagged && " ⚠️"}
                        </span>
                        <span className="block text-text-3">
                          {view.food.cat}
                        </span>
                      </td>
                      <td className="py-1.5">
                        <span className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            /* unitStep, NOT a hardcoded 5 (eng review D5). A
                               steak must step 1 → 2, not 1 → 6. */
                            min={unitMin()}
                            step={unitStep(view.food)}
                            value={view.qty}
                            onChange={(e) => {
                              composer.setQty(i, composerQty(e.target.value));
                              // Editing a quantity re-arms the zero guard, so
                              // a row zeroed AFTER an acknowledgement still
                              // gets its warning.
                              setAcknowledgedZero(false);
                            }}
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
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
            <span className="text-label uppercase text-text-3">Meal total</span>
            <span className="text-label" data-numeric>
              <b className="text-text">{composer.total.kcal} kcal</b> ·{" "}
              <span className="text-protein">{composer.total.pro}g P</span> ·{" "}
              <span className="text-carbs">{composer.total.carb}g C</span> ·{" "}
              <span className="text-fats">{composer.total.fat}g F</span>
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <label className="grid gap-1">
              <span className="text-label font-medium text-text-3">
                Meal name
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. My Tofu Bowl"
                className="min-h-11 rounded-btn border border-border bg-bg2 px-2 text-body text-text placeholder:text-text-3"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-label font-medium text-text-3">
                Category
              </span>
              {/* A NATIVE select. The dropdown rule governs anything we
                  hand-render; the platform's own picker is better than ours on
                  a phone and cannot get blur-before-click wrong. */}
              <select
                value={cat}
                onChange={(e) => setCat(e.target.value)}
                className="min-h-11 rounded-btn border border-border bg-bg2 px-2 text-body text-text"
              >
                {CATS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1">
              <span className="text-label font-medium text-text-3">Notes</span>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional tip"
                className="min-h-11 rounded-btn border border-border bg-bg2 px-2 text-body text-text placeholder:text-text-3"
              />
            </label>
          </div>

          {zeroRows.length > 0 && (
            <p role="status" className="text-label text-amber">
              {zeroRows.map((v) => v.food.name).join(", ")}{" "}
              {zeroRows.length === 1 ? "is" : "are"} at 0 —{" "}
              {needsAcknowledgement
                ? "set a quantity, or press Save anyway."
                : "press Save anyway once more to store it at 0."}
            </p>
          )}

          {clash && (
            <p role="status" className="text-label text-amber">
              A meal named “{clash.name}” already exists. Saving replaces it.
            </p>
          )}

          {error && (
            <p role="alert" className="text-label text-red">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={composer.clear}
              disabled={saving}
              className="min-h-11 rounded-btn border border-border px-3 text-label text-text-2 disabled:opacity-40"
            >
              ✕ Clear all
            </button>

            <div className="flex flex-col items-end gap-1">
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || blocked !== null}
                className="min-h-11 rounded-btn bg-blue px-4 text-label font-semibold text-text transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {saveLabel}
              </button>
              {blocked && (
                <span className="text-label text-text-3">{blocked}</span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
