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
  eta,
  sortByDate,
  trendWeight,
  weeklyRate,
} from "./trend";
export type { EtaResult } from "./trend";

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
