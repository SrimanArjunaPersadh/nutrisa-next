"use client";

/**
 * Add Custom Food — the manual-entry path (R1). Ports `cfRenderForm` (1134),
 * `cfTypeChange` (1352), `cfSave` (1740) and `cfRejectBadNumber` (1275).
 *
 * **BARCODE AND OCR ARE STRIPPED, deliberately.** The old form carries a
 * barcode field, a "Look up" button (Open Food Facts), a camera viewfinder and
 * a "photograph the label" button. Those are Phases 6 and 7 (`plan.md`), and
 * building the field now would mean shipping an input that does nothing. Every
 * food saved here therefore has `barcode: null`, which is why
 * `useCustomFoods().save` always takes the upsert-on-NAME branch.
 *
 * The `cfServing` per-serving view (1236–1330) is stripped for the same reason:
 * it only ever activates from `cfLookup`, which is the barcode path. What
 * survives is the branch a human typing a label actually uses.
 *
 * SA COMMA-DECIMALS ARE THE POINT OF THE `text` INPUTS. `parseFloat("10,6")`
 * stops at the comma and returns 10 — a silently wrong macro. The old app
 * switched these boxes from `number` to `text` so the SA keypad's comma gets
 * through, then normalised comma→period and validated against a regex before
 * parsing. All three halves of that are ported; dropping any one re-introduces
 * the bug (1742–1753).
 */

import { useMemo, useState } from "react";

import type { CustomFood, Result } from "@/lib/data";
import { FOOD_CATS } from "@/lib/food-db";
import type { NewCustomFood } from "@/lib/hooks/useCustomFoods";

export type AddCustomFoodProps = {
  existing: readonly CustomFood[];
  onSave: (food: NewCustomFood) => Promise<Result<CustomFood>>;
  onSaved: (name: string) => void;
};

/** How the food is measured. The old app's `cf-type` select (1157–1161). */
type MeasureType = "g" | "ml" | "unit";

/** Old app 1254. Blank is allowed; `"12abc"` and `"1.2.3"` are not. */
const NUM_RE = /^-?\d*[.,]?\d+$/;

/** `"10,6"` → `10.6`. Blank or unparseable → `null`. */
function num(raw: string): number | null {
  const value = parseFloat(raw.trim().replace(",", "."));
  return Number.isNaN(value) ? null : value;
}

/** Is this box either empty or a well-formed SA number? */
function wellFormed(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed === "" || NUM_RE.test(trimmed);
}

const EMPTY = {
  name: "",
  cat: "Protein",
  type: "g" as MeasureType,
  unit: "",
  qty: "100",
  kcal: "",
  pro: "",
  carb: "",
  fat: "",
};

export function AddCustomFood({
  existing,
  onSave,
  onSaved,
}: AddCustomFoodProps) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }

  /**
   * Switching measurement type moves the default quantity with it — but only
   * when it is still sitting on the OTHER type's default. A quantity the user
   * typed is never overwritten. Old app 1369 / 1374.
   */
  function setType(type: MeasureType) {
    setForm((prev) => ({
      ...prev,
      type,
      qty:
        type === "unit"
          ? prev.qty === "100" || prev.qty === ""
            ? "1"
            : prev.qty
          : prev.qty === "1" || prev.qty === ""
            ? "100"
            : prev.qty,
    }));
    setError(null);
  }

  const perUnitMode = form.type === "unit";

  /** The meal this save would replace. Name-only — every food here is barcodeless. */
  const clash = useMemo(() => {
    const needle = form.name.trim().toLowerCase();
    if (!needle) return null;
    return existing.find((f) => f.name.toLowerCase() === needle) ?? null;
  }, [existing, form.name]);

  /**
   * Everything `cfSave` checks before it builds a food, in the old app's order,
   * returning the message instead of `alert()`ing it.
   */
  function validate(): string | null {
    if (!form.name.trim()) return "Give the food a name.";

    for (const [value, label] of [
      [form.kcal, "Calories"],
      [form.pro, "Protein"],
      [form.carb, "Carbs"],
      [form.fat, "Fat"],
      [form.qty, "Default quantity"],
    ] as const) {
      if (!wellFormed(value)) {
        return `${label} must be a number (e.g. 11 or 11,3) — “${value.trim()}” isn’t.`;
      }
    }

    const kcal = num(form.kcal);
    if (kcal === null) return "Calories are required.";

    const macros = [kcal, num(form.pro) ?? 0, num(form.carb) ?? 0, num(form.fat) ?? 0];
    if (macros.some((m) => m < 0)) return "Macros cannot be negative.";

    if (perUnitMode) {
      // THE GRAM-UNIT GUARD (old app 1770, eng review D7's write side). A
      // per-unit food saved with unit `g` makes `isGramUnit` true, so
      // `macrosForQuantity` reads the `per100` that is not there and THROWS —
      // taking the screen down whenever that food is used.
      const unit = form.unit.trim().toLowerCase();
      if (unit === "g" || unit === "ml") {
        return `“${unit}” is a weight/volume unit. Choose “100 ${unit}” above instead, or name a count unit like slice, scoop or piece.`;
      }
    }

    return null;
  }

  /** `cfSave`'s food construction (1764–1800), minus the barcode branches. */
  function build(): NewCustomFood {
    const kcal = num(form.kcal) ?? 0;
    const macros = {
      kcal,
      pro: num(form.pro) ?? 0,
      carb: num(form.carb) ?? 0,
      fat: num(form.fat) ?? 0,
    };

    const name = clash ? clash.name : form.name.trim();
    const cat = form.cat || "Other";

    if (perUnitMode) {
      // `|| "unit"` — a per-unit food must never fall back to grams (1775).
      const unit = form.unit.trim().toLowerCase() || "unit";
      return {
        name,
        cat,
        unit,
        unitLabel: unit,
        defaultQty: num(form.qty) ?? 1,
        perUnit: macros,
        barcode: null,
      };
    }

    return {
      name,
      cat,
      unit: form.type,
      defaultQty: num(form.qty) ?? 100,
      per100: macros,
      barcode: null,
    };
  }

  async function save() {
    if (saving) return;

    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    setSaving(true);
    const food = build();
    const result = await onSave(food);
    setSaving(false);

    if (!result.ok) {
      setError(
        result.error.kind === "network"
          ? `Couldn’t reach the server — ${food.name} was not saved.`
          : result.error.kind === "conflict"
            ? `Couldn’t save ${food.name}: ${result.error.message}. The upsert target on custom_foods may be missing — check the constraint in Supabase.`
            : `Couldn’t save ${food.name}: ${result.error.message}`,
      );
      return;
    }

    setForm(EMPTY);
    onSaved(food.name);
  }

  const macroHeading = perUnitMode
    ? "Macros per unit"
    : `Macros per 100 ${form.type}`;

  const numericBox =
    "min-h-11 rounded-btn border border-border bg-bg2 px-2 text-body text-text placeholder:text-text-3";

  return (
    <div className="grid gap-3">
      <div>
        <p className="text-label uppercase tracking-wide text-text-2">
          Add an ingredient — typed by hand
        </p>
        <p className="mt-0.5 text-label text-text-3">
          Becomes searchable everywhere: meal builder, Quick Log, daily log.
          Barcode scanning and label photos arrive in Phases 6 and 7.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_11rem]">
        <label className="grid gap-1">
          <span className="text-label font-medium text-text-3">Food name</span>
          <input
            type="text"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Woolworths Pea Protein"
            autoComplete="off"
            className={numericBox}
          />
        </label>

        <label className="grid gap-1">
          <span className="text-label font-medium text-text-3">Category</span>
          <select
            value={form.cat}
            onChange={(e) => set("cat", e.target.value)}
            className="min-h-11 rounded-btn border border-border bg-bg2 px-2 text-body text-text"
          >
            {FOOD_CATS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <label className="grid gap-1">
          <span className="text-label font-medium text-text-3">Measured per</span>
          <select
            value={form.type}
            onChange={(e) => setType(e.target.value as MeasureType)}
            className="min-h-11 rounded-btn border border-border bg-bg2 px-2 text-body text-text"
          >
            <option value="g">100 g</option>
            <option value="ml">100 ml</option>
            <option value="unit">Unit (slice, scoop…)</option>
          </select>
        </label>

        {perUnitMode && (
          <label className="grid gap-1">
            <span className="text-label font-medium text-text-3">Unit name</span>
            <input
              type="text"
              value={form.unit}
              onChange={(e) => set("unit", e.target.value)}
              placeholder="slice, scoop, piece"
              autoComplete="off"
              className={numericBox}
            />
          </label>
        )}

        <label className="grid gap-1">
          <span className="text-label font-medium text-text-3">
            Default qty ({perUnitMode ? "units" : form.type})
          </span>
          {/* `text`, not `number`, so the SA keypad's comma reaches us. */}
          <input
            type="text"
            inputMode="decimal"
            value={form.qty}
            onChange={(e) => set("qty", e.target.value)}
            className={numericBox}
            data-numeric
          />
        </label>
      </div>

      <p className="text-label uppercase tracking-wide text-text-3">
        {macroHeading}
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            ["kcal", "Calories", "text-text-3", "kcal"],
            ["pro", "Protein", "text-protein", "g"],
            ["carb", "Carbs", "text-carbs", "g"],
            ["fat", "Fat", "text-fats", "g"],
          ] as const
        ).map(([key, label, tone, hint]) => (
          <label key={key} className="grid gap-1">
            <span className={`text-label font-medium ${tone}`}>{label}</span>
            <input
              type="text"
              inputMode="decimal"
              value={form[key]}
              onChange={(e) => set(key, e.target.value)}
              placeholder={hint}
              className={numericBox}
              data-numeric
            />
          </label>
        ))}
      </div>

      {clash && (
        <p role="status" className="text-label text-amber">
          A food named “{clash.name}” already exists. Saving replaces it.
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
          onClick={() => {
            setForm(EMPTY);
            setError(null);
          }}
          disabled={saving}
          className="min-h-11 rounded-btn border border-border px-3 text-label text-text-2 disabled:opacity-40"
        >
          ✕ Clear
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="min-h-11 rounded-btn bg-blue px-4 text-label font-semibold text-text transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {saving ? "Saving…" : clash ? "Overwrite food" : "Save food"}
        </button>
      </div>
    </div>
  );
}
