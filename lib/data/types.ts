/**
 * Row shapes and app shapes for the Supabase data layer (Plan §2, §8).
 *
 * TWO vocabularies live in this file and they DO NOT MATCH. That mismatch is the
 * whole reason `mappers.ts` exists:
 *
 *   DB column      →  app field
 *   ─────────────     ──────────
 *   per_unit       →  perUnit
 *   default_qty    →  defaultQty
 *   unit_label     →  unitLabel
 *   logged_time    →  time
 *   ings_json      →  _ings      (JSON *string* → parsed array)
 *   id             →  _id
 *   weight         →  weight     (same name; `w` in the old app's local store)
 *
 * A wrong mapping here is silently wrong macros — the exact failure the correctness
 * oracle (Plan §6) exists to catch. Every mapping is tested against real rows.
 *
 * Schema facts confirmed against the live DB 2026-07-31; see
 * `docs/PHASE-2-DECISIONS.md` §12.
 */

import type { Macros, UnitType } from "../engine/types";

/* ────────────────────────────────────────────────────────────────────────────
   Result — every write and every read returns one of these. Nothing throws.
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Why an operation failed, as a small closed union.
 *
 * Deliberately coarse. These map to what a user can be TOLD and what they can DO
 * about it (Plan §4.4's Error state), not to Postgres's error taxonomy.
 */
export type ErrorKind =
  /** The request never completed — offline, DNS, timeout, CORS. Retryable. */
  | "network"
  /** A uniqueness or upsert-target conflict. Usually a missing/mismatched constraint. */
  | "conflict"
  /** The row asked for is not there. */
  | "not-found"
  /** Anything we have not classified. Carries the raw message so it is never mute. */
  | "unknown";

export type DataError = {
  readonly kind: ErrorKind;
  readonly message: string;
};

export type Result<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: DataError };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });

export const err = <T>(kind: ErrorKind, message: string): Result<T> => ({
  ok: false,
  error: { kind, message },
});

/* ────────────────────────────────────────────────────────────────────────────
   DB ROW SHAPES — what PostgREST hands back. Not what the app uses.
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Postgres `numeric` arrives as a JSON number in this project, but PostgREST is
 * configured elsewhere to send numerics as strings, and the old app defended
 * against both with `parseFloat` everywhere (e.g. line 1883). We keep that
 * defence: every numeric column is typed loose and coerced in one place.
 */
export type Numeric = number | string;

/** `weight_logs` — one weigh-in. `date` is a BARE `YYYY-MM-DD` (§12 finding 1). */
export type WeightRow = {
  readonly id: string;
  readonly date: string;
  readonly weight: Numeric;
  readonly created_at: string;
};

/**
 * `meal_logs` — one logged meal.
 *
 * `ings_json` is a JSON **string**, not jsonb — contrast `custom_meals.ingredients`.
 * `lib_id` holds a meal NAME, not a UUID and not a foreign key: the old app sets it
 * to the name on purpose (3564 — *"UUIDs change if a meal is deleted and recreated;
 * names don't"*).
 * `logged_time` is free text like `"1:03"` / `"23:25"` — unpadded, never parsed.
 */
export type MealRow = {
  readonly id: string;
  readonly date: string;
  readonly name: string;
  readonly kcal: Numeric;
  readonly pro: Numeric;
  readonly carb: Numeric;
  readonly fat: Numeric;
  readonly logged_time: string | null;
  readonly sort_order: number;
  readonly lib_id: string | null;
  readonly ings_json: string | null;
  readonly created_at: string;
};

/**
 * `custom_meals` — a saved multi-ingredient meal.
 *
 * `ingredients` is **jsonb**: it arrives already parsed. Its `qty` values carry a
 * unit suffix (`"80g"`), unlike `meal_logs.ings_json` whose `qty` values are bare
 * (`"80"`). Two tables, two conventions, both stored as strings (§12 finding 5).
 */
export type CustomMealRow = {
  readonly id: string;
  readonly name: string;
  readonly cat: string | null;
  readonly note: string | null;
  readonly kcal: Numeric;
  readonly pro: Numeric;
  readonly carb: Numeric;
  readonly fat: Numeric;
  readonly ingredients: readonly StoredIngredient[] | null;
  readonly created_at: string;
};

/**
 * `custom_foods` — a scanned or manually-added ingredient, in `FOOD_DB` shape.
 *
 * `per100` and `per_unit` are mutually exclusive and track `isGramUnit`: `g`/`ml`
 * rows carry `per100`, everything else carries `per_unit` plus a `unit_label`.
 */
export type CustomFoodRow = {
  readonly id: string;
  readonly name: string;
  readonly cat: string | null;
  readonly unit: string | null;
  readonly default_qty: Numeric | null;
  readonly per100: Macros | null;
  readonly per_unit: Macros | null;
  readonly unit_label: string | null;
  readonly barcode: string | null;
  readonly created_at: string;
};

/** `water_logs` — cups for a day. One row per date. */
export type WaterRow = {
  readonly id: string;
  readonly date: string;
  readonly cups: number;
  readonly created_at: string;
};

/* ────────────────────────────────────────────────────────────────────────────
   APP SHAPES — what the rest of NutriSA works with.
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * An ingredient as STORED, in either `ings_json` or `ingredients`.
 *
 * `qty` is a string in both, and the two disagree on format — `"80"` in
 * `meal_logs`, `"80g"` in `custom_meals`. It stays a string here. Anything that
 * needs a number calls `ingredientQty()`, which is the one place that coercion is
 * allowed to happen.
 */
export type StoredIngredient = {
  readonly name: string;
  readonly qty: string;
  readonly kcal: number;
  readonly pro: number;
  readonly carb: number;
  readonly fat: number;
};

/** A logged meal, as the app uses it. Mirrors the old app's local meal object. */
export type LoggedMeal = Macros & {
  /** `meal_logs.id`. Absent only for an object not yet written. */
  readonly _id?: string;
  /** `lib_id` — the source library meal's NAME, not an id. */
  readonly _libId: string | null;
  /** Parsed `ings_json`. `null` when absent OR when the JSON was unparseable. */
  readonly _ings: readonly StoredIngredient[] | null;
  readonly name: string;
  /** `logged_time`, free text. Never parsed, never reformatted. */
  readonly time: string;
  /** `sort_order` as stored. 1-BASED — see PHASE-2-DECISIONS §5. */
  readonly sortOrder: number;
};

/** A saved library meal. */
export type CustomMeal = Macros & {
  readonly _id: string;
  /**
   * The same value as `_id`. The old app exposes both (1936–1937) so that its
   * `(c.id || c.name)` lookups work. Kept for translation fidelity.
   */
  readonly id: string;
  readonly name: string;
  readonly cat: string;
  readonly note: string;
  readonly ingredients: readonly StoredIngredient[];
};

/**
 * A custom food. Structurally assignable to the engine's `Food`, so
 * `macrosForQuantity(food, qty)` takes one of these directly.
 */
export type CustomFood = {
  readonly _id?: string;
  readonly name: string;
  readonly cat: string;
  readonly unit: UnitType;
  readonly defaultQty: number;
  readonly per100?: Macros;
  readonly perUnit?: Macros;
  readonly unitLabel?: string;
  readonly barcode: string | null;
};

/** A weigh-in, in the engine's shape — `lib/engine` already defines it. */
export type { WeightEntry } from "../engine/types";
