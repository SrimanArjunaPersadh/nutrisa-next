/**
 * The deterministic engine (Migration Plan §6).
 *
 * Every figure NutriSA displays is computed by something in here. The model
 * transcribes and explains; this code computes. Nothing in this directory may
 * import React, Supabase, or anything else — these are pure functions with
 * first-ever unit tests, and they stay that way.
 */

export type { Food, Macros, TrendPoint, UnitType, WeightEntry } from "./types";

export {
  ASSUMED_RATE_KG_PER_WEEK,
  GOAL_KG,
  TARGET_RATE_KG_PER_DAY,
  eta,
  sortByDate,
  targetLine,
  trendWeight,
  weeklyAverages,
  weeklyRate,
  weeklyRateAt,
} from "./trend";
export type { EtaResult, WeeklyAverage } from "./trend";

export {
  ATWATER_TOLERANCE,
  LABEL_KCAL_MAX,
  LABEL_MACRO_MAX,
  atwaterCheck,
  clampLabelMacros,
  clampLabelValue,
  kJtoKcal,
  per100gToPerServing,
  perServingToPer100g,
} from "./nutrition";
export type { AtwaterResult, LabelMacros } from "./nutrition";

export { isGramUnit, macrosForQuantity } from "./macros";

export {
  CARB_MAX,
  CARB_MIN,
  CEILINGS,
  FAT_MAX,
  FAT_MIN,
  KCAL_MAX,
  KCAL_MIN,
  KCAL_TARGET,
  PRO_MAX,
  PRO_MIN,
  PRO_TARGET,
  dayTotals,
  macroStatus,
  remaining,
  remainingMacros,
} from "./day";
export type { MacroStatus } from "./day";
