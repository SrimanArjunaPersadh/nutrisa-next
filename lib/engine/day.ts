/**
 * A day's nutrition arithmetic — totals, targets, what's left. Plan §6.
 *
 * Ported from the old app's `tot()` (513–517), the target constants (439–442) and
 * `bc()` (518) in `docs/reference/old-index.html`.
 *
 * This is engine, not display, for the §6 reason: these numbers feed the tiles,
 * the bars AND the colour decisions. Rounding that only renders is display;
 * rounding that other code reads is engine. `tot()` rounds, and everything on the
 * Nutrition page reads what it rounded.
 */

import type { Macros } from "./types";

/* ---- Daily targets. The old app's, frozen (439–442). ---------------------- */
/* These are one person's targets, hardcoded in the old app and carried across
 * unchanged. They are NOT user-configurable and Phase 4 does not make them so —
 * that would be an invented feature (Plan §3). */

export const KCAL_MIN = 2200;
export const KCAL_TARGET = 2300;
export const KCAL_MAX = 2400;

/** All three are 175. The old app really does set min = target = max (440). */
export const PRO_MIN = 175;
export const PRO_TARGET = 175;
export const PRO_MAX = 175;

export const CARB_MIN = 180;
export const CARB_MAX = 210;

export const FAT_MIN = 55;
export const FAT_MAX = 65;

/** The ceiling each tile counts down to (PHASE-4-DECISIONS §2). */
export const CEILINGS: Macros = {
  kcal: KCAL_MAX,
  pro: PRO_MAX,
  carb: CARB_MAX,
  fat: FAT_MAX,
};

/** Anything with macros on it — a logged meal, a saved meal, a portioned food. */
type MacroBearing = {
  readonly kcal: number;
  readonly pro: number;
  readonly carb: number;
  readonly fat: number;
};

/**
 * A day's totals. Ports `tot()` (513–517) exactly, rounding included.
 *
 * THE ROUNDING IS THE CONTRACT: sum the UNROUNDED per-meal values, then round
 * ONCE at the end — `Math.round` on kcal, `+toFixed(1)` on the three macros.
 * Rounding each meal first and summing those would drift, and the old app's
 * stored screens are the oracle (§6).
 *
 * `Math.round` here and `+toFixed()` there is not an inconsistency to tidy: it is
 * what the old app wrote, and the two disagree on exact-half values. Frozen for
 * the same reason `trendWeight` is (PHASE-1-DECISIONS §1).
 *
 * Note that `lib/data/mappers.ts` has ALREADY rounded each row on read (Phase 2,
 * frozen) — so in production this rounds values that are themselves rounded.
 * That is exactly what the old app did too: it read the same columns through the
 * same rounding and then called `tot()` on the result.
 */
export function dayTotals(meals: readonly MacroBearing[]): Macros {
  const sum = meals.reduce(
    (a, m) => ({
      kcal: a.kcal + m.kcal,
      pro: a.pro + m.pro,
      carb: a.carb + m.carb,
      fat: a.fat + m.fat,
    }),
    { kcal: 0, pro: 0, carb: 0, fat: 0 },
  );

  return {
    kcal: Math.round(sum.kcal),
    pro: +sum.pro.toFixed(1),
    carb: +sum.carb.toFixed(1),
    fat: +sum.fat.toFixed(1),
  };
}

/**
 * What is left of a ceiling. SIGNED — negative means over (§2).
 *
 * The engine subtracts; the view decides whether that reads as "620 left" or
 * "140 over". Returning a formatted string here, or clamping at zero, would be
 * the view making a decision inside the engine.
 *
 * Rounded to 1 dp because the inputs already are, and floating-point subtraction
 * of two 1 dp numbers is how you get `39.99999999999999` on a tile.
 */
export function remaining(consumed: number, ceiling: number): number {
  return +(ceiling - consumed).toFixed(1);
}

/** Every tile's remaining figure at once, against {@link CEILINGS}. */
export function remainingMacros(totals: Macros): Macros {
  return {
    kcal: remaining(totals.kcal, CEILINGS.kcal),
    pro: remaining(totals.pro, CEILINGS.pro),
    carb: remaining(totals.carb, CEILINGS.carb),
    fat: remaining(totals.fat, CEILINGS.fat),
  };
}

/**
 * Where a value sits against its range. Ports `bc()` (518), which returned a CSS
 * colour string.
 *
 * The engine returns MEANING and the view maps it to `--red` / `--green` /
 * `--blue` (§1.5). Same discipline as `eta`'s result union and
 * `weightDirections`: a pure function that knows about `var(--red)` is a pure
 * function that has opinions about stylesheets.
 *
 * The boundaries are the old app's, inclusive-at-min and exclusive-at-max:
 * `v > max` is over, `v >= min` is in range, anything below is under.
 */
export type MacroStatus = "over" | "in-range" | "under";

export function macroStatus(
  value: number,
  min: number,
  max: number,
): MacroStatus {
  if (value > max) return "over";
  if (value >= min) return "in-range";
  return "under";
}
