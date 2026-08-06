"use client";

/**
 * The gram editor for a logged meal. Ports `loggedItemEditor` (3230),
 * `loggedItemEditorWithIngs` (3245), `loggedItemMacroEditor` (3287),
 * `updateLoggedEntry` (3347), `updateLoggedMacros` (3382), `logRemoveIng` (3458)
 * and `resetGCustom` (667).
 *
 * PULLED FORWARD INTO PHASE 4 at the owner's request (PHASE-4-DECISIONS §3a).
 * §3 had put it in Phase 5; a logged meal you cannot re-portion is too thin for
 * daily use.
 *
 * PHASE 5 COMPLETES IT with the "Add Item" search widget (`logAddSearchWidget`,
 * 3403; `logAddFood`, 3442), which Phase 4 had to leave out because it needs
 * search across the food database. It appears only when a `pool` is supplied,
 * so the component still renders without one.
 *
 * The old app's `_logEditorIngs` / `_logAddedIngs` split exists to track which
 * rows came from that search. Here the base list and the added list are two
 * pieces of state and `updateLoggedEntry`'s `[...baseIngs, ...addedIngs]`
 * (3349) is one array literal.
 *
 * TWO EDITORS, chosen the way the old app chooses (3230–3243):
 *   • The meal has ingredients → per-ingredient gram editor.
 *   • It has none → a direct four-macro editor, because there is nothing to
 *     re-portion. `updateMeal` leaves `ings_json` untouched on that path.
 *
 * Ingredients come from the meal's OWN stored `_ings` first and the library
 * definition only as a fallback — post-edit state beats the library, or a
 * re-portioned meal would silently snap back to its original grams (3234).
 */

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";

import { FoodSearch } from "@/components/library/food-search";
import type { CustomMeal, LoggedMeal, StoredIngredient } from "@/lib/data";
import type { Macros } from "@/lib/engine/types";
import { isGramUnit, macrosForQuantity } from "@/lib/engine/macros";
import type { SearchableFood } from "@/lib/food-db";
import {
  baseQty,
  scaleIngredients,
  sumIngredients,
  toStoredIngredients,
} from "@/lib/engine/ingredients";

export type MealEditorProps = {
  meal: LoggedMeal;
  /** The library meals, for the fallback ingredient structure (3238). */
  library: readonly CustomMeal[];
  /**
   * The food pool for "Add Item". Omit and the widget is not rendered —
   * the editor is fully usable without it, as Phase 4 shipped it.
   */
  pool?: readonly SearchableFood[];
  /** Saves; resolves when the write has been reported. */
  onSave: (
    macros: Macros,
    ings?: readonly StoredIngredient[] | null,
  ) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
};

/**
 * A searched food, frozen into a stored ingredient at its default quantity.
 * Old app `logAddFood` (3445–3447).
 *
 * NOTE the default: `defaultQty || (isGramUnit ? 100 : 1)`, which is NOT the
 * composer's `|| 100` (`useComposer`). Two call sites, two fallbacks, both the
 * old app's. Unifying them would change a starting quantity that has been the
 * same for every meal ever logged from this widget.
 */
function toAddedIngredient(food: SearchableFood): StoredIngredient {
  const qty = food.defaultQty || (isGramUnit(food) ? 100 : 1);
  const macros = macrosForQuantity(food, qty);
  return {
    name: food.name,
    qty: String(qty),
    kcal: macros.kcal,
    pro: macros.pro,
    carb: macros.carb,
    fat: macros.fat,
  };
}

/** The "Add Item" search strip. Old app `logAddSearchWidget` (3403). */
function AddItem({
  pool,
  onAdd,
}: {
  pool: readonly SearchableFood[];
  onAdd: (ing: StoredIngredient) => void;
}) {
  return (
    <div className="mt-3 border-t border-border pt-2.5">
      <p className="mb-1.5 text-label font-medium uppercase text-text-3">
        Add item
      </p>
      <FoodSearch
        pool={pool}
        onSelect={(food) => onAdd(toAddedIngredient(food))}
        placeholder="Search ingredient to add…"
        ariaLabel="Search an ingredient to add to this meal"
      />
    </div>
  );
}

/**
 * Which ingredient list this meal edits. Old app 3231–3242.
 *
 * The library lookup is by NAME (`_libId`), falling back to the displayed name —
 * `lib_id` stores a name precisely so it survives a delete-and-recreate (3564).
 */
function ingredientsFor(
  meal: LoggedMeal,
  library: readonly CustomMeal[],
): readonly StoredIngredient[] | null {
  if (meal._ings && meal._ings.length > 0) return meal._ings;

  const lookup = meal._libId || meal.name;
  const source = library.find((c) => c.name === lookup || c._id === lookup);

  if (source && source.ingredients.length > 0) {
    // Normalised to bare-number quantities, the meal_logs convention (3239).
    return source.ingredients.map((ing) => ({
      ...ing,
      qty: String(parseFloat(ing.qty) || 100),
    }));
  }

  return null;
}

export function MealEditor(props: MealEditorProps) {
  const ings = useMemo(
    () => ingredientsFor(props.meal, props.library),
    [props.meal, props.library],
  );

  return ings ? (
    <IngredientEditor {...props} ings={ings} />
  ) : (
    <MacroEditor {...props} />
  );
}

/* ── Per-ingredient gram editor ─────────────────────────────────────────── */

function IngredientEditor({
  ings,
  pool,
  onSave,
  onCancel,
  saving,
}: MealEditorProps & { ings: readonly StoredIngredient[] }) {
  /** Sparse quantity overrides — the old app's `S.gO`, as state instead of a global. */
  const [qty, setQty] = useState<(number | undefined)[]>([]);
  /** Indices removed in this editing session (old `logRemoveIng`, 3458). */
  const [removed, setRemoved] = useState<ReadonlySet<number>>(new Set());
  /** Rows added by the search widget. Old app `S._logAddedIngs`. */
  const [added, setAdded] = useState<readonly StoredIngredient[]>([]);

  // `[...baseIngs, ...addedIngs]` — old app 3349. Added rows are ordinary
  // stored ingredients from here on: they scale, they total and they delete
  // exactly like the ones that came off the meal.
  const all = useMemo(() => [...ings, ...added], [ings, added]);

  // Recomputed on every keystroke — this IS the "live macro calc" of Plan §5.4.
  // No debounce: the old app needed one because it was writing to the DOM by id
  // (665); React re-rendering four numbers does not.
  const kept = all
    .map((ing, i) => ({ ing, i }))
    .filter(({ i }) => !removed.has(i));

  const scaled = scaleIngredients(
    kept.map((k) => k.ing),
    kept.map((k) => qty[k.i]),
  );
  const total = sumIngredients(scaled);

  const dirty =
    removed.size > 0 ||
    added.length > 0 ||
    qty.some((q, i) => q !== undefined && all[i] && q !== baseQty(all[i]));

  function setOne(index: number, raw: string) {
    // `parseFloat(val) || 0` — the old app's coercion (656). An empty box reads
    // as zero, not as "unchanged", so the totals fall to zero and the user can
    // see what they are about to save.
    const value = parseFloat(raw) || 0;
    setQty((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function reset() {
    setQty([]);
    setRemoved(new Set());
    setAdded([]);
  }

  return (
    <div className="rounded-card bg-bg3 p-3">
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
          {kept.map(({ ing, i }, row) => (
            <tr key={`${ing.name}-${i}`} className="border-t border-border">
              <td className="py-1.5 pr-2 text-text-2">{ing.name}</td>
              <td className="py-1.5">
                <input
                  type="number"
                  min={0}
                  // The old app picks its step from whether the stored quantity
                  // is a whole number: 5 for grams, 0.5 for scoops (3263).
                  step={Number.isInteger(baseQty(ing)) ? 5 : 0.5}
                  value={qty[i] ?? baseQty(ing)}
                  onChange={(e) => setOne(i, e.target.value)}
                  aria-label={`${ing.name} quantity`}
                  className="min-h-11 w-16 rounded-btn border border-border bg-bg2 px-2 text-right text-body text-text"
                  data-numeric
                />
              </td>
              <td className="py-1.5 text-right text-text" data-numeric>
                {scaled[row].kcal}
              </td>
              <td className="py-1.5 text-right text-protein" data-numeric>
                {Math.round(scaled[row].pro)}g
              </td>
              <td className="py-1.5 text-right text-carbs" data-numeric>
                {Math.round(scaled[row].carb)}g
              </td>
              <td className="py-1.5 text-right text-fats" data-numeric>
                {Math.round(scaled[row].fat)}g
              </td>
              <td className="py-1.5 pl-1 text-right">
                <button
                  type="button"
                  onClick={() =>
                    setRemoved((prev) => new Set(prev).add(i))
                  }
                  aria-label={`Remove ${ing.name}`}
                  className="grid size-8 place-items-center rounded-btn text-text-3 transition-colors hover:text-red"
                >
                  <Trash2 size={13} aria-hidden />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {pool && <AddItem pool={pool} onAdd={(ing) => setAdded((p) => [...p, ing])} />}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
        <span className="text-label uppercase text-text-3">New total</span>
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
          onClick={reset}
          disabled={!dirty || saving}
          className="min-h-11 rounded-btn border border-border px-3 text-label text-text-2 disabled:opacity-40"
        >
          ↺ Reset
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="min-h-11 rounded-btn px-3 text-label text-text-3 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() =>
              void onSave(total, toStoredIngredients(scaled))
            }
            disabled={saving || kept.length === 0}
            className="min-h-11 rounded-btn bg-blue px-4 text-label font-semibold text-text transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {saving ? "Saving…" : "✓ Update"}
          </button>
        </div>
      </div>

      {kept.length === 0 && (
        <p className="mt-2 text-label text-amber">
          Every ingredient removed. Delete the meal itself instead.
        </p>
      )}
    </div>
  );
}

/* ── Direct macro editor, for a meal with no ingredients ────────────────── */

function MacroEditor({ meal, pool, onSave, onCancel, saving }: MealEditorProps) {
  const [form, setForm] = useState({
    kcal: String(meal.kcal),
    pro: String(meal.pro),
    carb: String(meal.carb),
    fat: String(meal.fat),
  });
  /** Rows added by the search widget. Old app `S._logAddedIngs` (3290). */
  const [added, setAdded] = useState<readonly StoredIngredient[]>([]);
  const [qty, setQty] = useState<(number | undefined)[]>([]);

  // ADDING AN ITEM TAKES OVER THE EDITOR. The old app returns early once
  // anything has been added (3296–3331): the four boxes disappear and the meal
  // becomes "original macros PLUS these items". The base it adds to is the
  // meal's STORED macros, not whatever is in the boxes — `S._logMacroBase` is
  // captured before any of this (3293).
  const addedScaled = scaleIngredients(added, qty);
  const addedTotal = sumIngredients(addedScaled);

  /** Old app 3529–3534: round the SUM, not the parts. */
  const combined: Macros = {
    kcal: Math.round(meal.kcal + addedTotal.kcal),
    pro: +(meal.pro + addedTotal.pro).toFixed(1),
    carb: +(meal.carb + addedTotal.carb).toFixed(1),
    fat: +(meal.fat + addedTotal.fat).toFixed(1),
  };

  const fields = [
    { key: "kcal", label: "Kcal", tone: "text-text" },
    { key: "pro", label: "Protein", tone: "text-protein" },
    { key: "carb", label: "Carbs", tone: "text-carbs" },
    { key: "fat", label: "Fat", tone: "text-fats" },
  ] as const;

  /**
   * Old app `updateLoggedMacroEntry` (3513). Two paths, and which one runs is
   * decided by whether anything was added — never by the boxes.
   */
  function save() {
    if (added.length > 0) {
      // `newIngs` REPLACES `ings_json` with just the added rows (3535–3539) —
      // this meal never had an ingredient list, so the added items are the
      // whole list it now has.
      void onSave(combined, toStoredIngredients(addedScaled));
      return;
    }

    const n = (v: string) => parseFloat(v) || 0;
    void onSave({
      kcal: Math.round(n(form.kcal)),
      pro: +n(form.pro).toFixed(1),
      carb: +n(form.carb).toFixed(1),
      fat: +n(form.fat).toFixed(1),
    });
    // `ings` omitted, not null: this meal has no ingredient list and a
    // macro-only edit must leave the stored column exactly as it found it.
  }

  return (
    <div className="rounded-card bg-bg3 p-3">
      {added.length > 0 ? (
        <>
          <p className="text-label text-text-3" data-numeric>
            Original: {meal.kcal} kcal · {meal.pro}g P · {meal.carb}g C ·{" "}
            {meal.fat}g F
          </p>

          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-label">
              <thead>
                <tr className="text-text-3">
                  <th className="pb-1 text-left font-medium">Added item</th>
                  <th className="pb-1 text-right font-medium">Qty</th>
                  <th className="pb-1 text-right font-medium">Kcal</th>
                  <th className="pb-1 text-right font-medium text-protein">P</th>
                  <th className="pb-1 text-right font-medium text-carbs">C</th>
                  <th className="pb-1 text-right font-medium text-fats">F</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {added.map((ing, i) => (
                  <tr key={`${ing.name}-${i}`} className="border-t border-border">
                    <td className="py-1.5 pr-2 text-text-2">{ing.name}</td>
                    <td className="py-1.5">
                      <input
                        type="number"
                        min={0}
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
                      {addedScaled[i].kcal}
                    </td>
                    <td className="py-1.5 text-right text-protein" data-numeric>
                      {Math.round(addedScaled[i].pro)}g
                    </td>
                    <td className="py-1.5 text-right text-carbs" data-numeric>
                      {Math.round(addedScaled[i].carb)}g
                    </td>
                    <td className="py-1.5 text-right text-fats" data-numeric>
                      {Math.round(addedScaled[i].fat)}g
                    </td>
                    <td className="py-1.5 pl-1 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          setAdded((prev) => prev.filter((_, j) => j !== i))
                        }
                        aria-label={`Remove ${ing.name}`}
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
            <span className="text-label uppercase text-text-3">New total</span>
            <span className="text-label" data-numeric>
              <b className="text-text">{combined.kcal} kcal</b> ·{" "}
              <span className="text-protein">{Math.round(combined.pro)}g P</span>{" "}
              ·{" "}
              <span className="text-carbs">{Math.round(combined.carb)}g C</span>{" "}
              · <span className="text-fats">{Math.round(combined.fat)}g F</span>
            </span>
          </div>
        </>
      ) : (
        <>
          <p className="text-label text-text-3">
            No ingredient breakdown for this meal — edit its macros directly.
          </p>

          <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
            {fields.map(({ key, label, tone }) => (
              <label key={key} className="grid gap-1">
                <span className={`text-label font-medium ${tone}`}>{label}</span>
                <input
                  type="number"
                  min={0}
                  step={key === "kcal" ? 10 : 0.1}
                  value={form[key]}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  className="min-h-11 rounded-btn border border-border bg-bg2 px-2 text-body text-text"
                  data-numeric
                />
              </label>
            ))}
          </div>
        </>
      )}

      {pool && <AddItem pool={pool} onAdd={(ing) => setAdded((p) => [...p, ing])} />}

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="min-h-11 rounded-btn px-3 text-label text-text-3 disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="min-h-11 rounded-btn bg-blue px-4 text-label font-semibold text-text transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {saving ? "Saving…" : "✓ Update"}
        </button>
      </div>
    </div>
  );
}
