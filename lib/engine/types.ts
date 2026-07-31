/**
 * Shared types for the deterministic engine (Migration Plan §6).
 *
 * These mirror the OLD app's runtime shapes exactly — they do not improve them.
 * Where the old app was loose (a food carrying either `per100` or `perUnit`, a
 * unit string the user can type freely), these types stay loose too, because
 * tightening them would change which real rows the engine accepts.
 */

/** A raw weigh-in, as stored in `weight_logs`. `date` is ISO `YYYY-MM-DD`. */
export type WeightEntry = {
  readonly date: string;
  readonly weight: number;
};

/** One point on the smoothed trend line. `tw` is the trend weight in kg. */
export type TrendPoint = {
  readonly date: string;
  readonly tw: number;
};

/** The four figures every food, meal and day is measured in. */
export type Macros = {
  readonly kcal: number;
  readonly pro: number;
  readonly carb: number;
  readonly fat: number;
};

/**
 * A food's unit of measure.
 *
 * DELIBERATELY OPEN, not a closed union. The old app's `cfSave` lets the user
 * type any unit name they like ("biscuit", "sausage", "steak", "spray"…), and
 * `FOOD_DB` already ships units beyond any fixed list. The only distinction the
 * ARITHMETIC makes is `isGramUnit` — `g`/`ml` take the per-100 path, everything
 * else takes the per-unit path. `(string & {})` keeps editor autocomplete for
 * the two that matter while still accepting the rest.
 */
export type UnitType = "g" | "ml" | (string & {});

/**
 * A food as the old app stores it (`FOOD_DB` entries and `custom_meals` rows
 * share this shape). Exactly one of `per100` / `perUnit` is meaningful, chosen
 * by `isGramUnit`; the other is absent or null.
 */
export type Food = {
  readonly unit: UnitType;
  readonly per100?: Macros | null;
  readonly perUnit?: Macros | null;
};
