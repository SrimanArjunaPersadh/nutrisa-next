/**
 * Label arithmetic — kJ→kcal, per-serving→per-100g, range guards, Atwater check.
 * Migration Plan §6.
 *
 * THIS FILE IS WHY THE ARITHMETIC RULE EXISTS. `/api/ocr-label` (Phase 7) returns
 * only what is PRINTED on the label — values, units, serving size. Every number
 * derived from that transcription is computed here, in code. If a prompt change
 * would make the model return a computed figure, that change is FORBIDDEN (§6).
 *
 * Ported from the old app's inline OCR pipeline (`docs/reference/old-index.html`
 * lines 1556–1592) and the Open Food Facts path (line 1453), neither of which had
 * named functions — this is the first time they exist as testable units.
 */

/** Kilojoules per kilocalorie. The conversion the model is never allowed to do. */
const KJ_PER_KCAL = 4.184;

/**
 * Highest plausible kcal per 100 g. 100 g of pure fat is 900 kcal; anything above
 * this ceiling is a misread, not a food. Old app line 1575.
 */
export const LABEL_KCAL_MAX = 902;

/** No macro can exceed 100 g per 100 g of product. Old app line 1575. */
export const LABEL_MACRO_MAX = 100;

/**
 * How far the Atwater reconstruction may sit from the label's own kcal before we
 * call the read suspect. 20% of the LABEL's kcal (not of the estimate).
 */
export const ATWATER_TOLERANCE = 0.2;

/**
 * Kilojoules → kilocalories. Unrounded: rounding is the caller's business, and
 * the old app rounds only at the point of filling a form box (`round1`, line 1577).
 */
export function kJtoKcal(kJ: number): number {
  return kJ / KJ_PER_KCAL;
}

/**
 * A per-serving figure scaled up to the per-100g canonical storage basis.
 *
 * Unrounded, matching the OCR path (line 1567). The Save path rounds the result
 * to 2 dp (line 1796) — that rounding stays at the call site in Phase 6/7,
 * because it is a storage decision, not part of the conversion.
 *
 * @throws if `servingG` is not a positive finite number. The old app guarded this
 * at every call site (`Number.isFinite(out.serving_g) && out.serving_g > 0`);
 * throwing keeps a bad serving size from silently producing Infinity.
 */
export function perServingToPer100g(value: number, servingG: number): number {
  assertPositiveServing(servingG);
  return value * (100 / servingG);
}

/**
 * The inverse: a per-100g figure expressed for one serving. Old app line 1299
 * (`cfShowServing`), which flips the form into its per-serving view.
 */
export function per100gToPerServing(value: number, servingG: number): number {
  assertPositiveServing(servingG);
  return value * (servingG / 100);
}

function assertPositiveServing(servingG: number): void {
  if (!Number.isFinite(servingG) || servingG <= 0) {
    throw new RangeError(
      `serving size must be a positive number of grams, got ${servingG}`,
    );
  }
}

/**
 * Range guard for a transcribed label value: keep it if it is finite and within
 * `[0, max]`, otherwise drop it to `null` so the form box is left blank rather
 * than pre-filled with nonsense. Old app line 1574.
 */
export function clampLabelValue(
  value: number | null | undefined,
  max: number,
): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= max
    ? value
    : null;
}

/** A transcribed label's four figures, any of which may have been unreadable. */
export type LabelMacros = {
  readonly kcal: number | null;
  readonly pro: number | null;
  readonly carb: number | null;
  readonly fat: number | null;
};

/** Apply {@link clampLabelValue} to all four figures with their proper ceilings. */
export function clampLabelMacros(input: {
  kcal?: number | null;
  pro?: number | null;
  carb?: number | null;
  fat?: number | null;
}): LabelMacros {
  return {
    kcal: clampLabelValue(input.kcal, LABEL_KCAL_MAX),
    pro: clampLabelValue(input.pro, LABEL_MACRO_MAX),
    carb: clampLabelValue(input.carb, LABEL_MACRO_MAX),
    fat: clampLabelValue(input.fat, LABEL_MACRO_MAX),
  };
}

/** The verdict on a label read. `checked: false` means we declined to judge. */
export type AtwaterResult =
  | {
      readonly checked: false;
      /** `incomplete` = a value was unreadable; `non-positive` = kcal or estimate ≤ 0. */
      readonly reason: "incomplete" | "non-positive";
    }
  | {
      readonly checked: true;
      /** 4·protein + 4·carbs + 9·fat. */
      readonly estimatedKcal: number;
      /** |estimate − label| ÷ label. */
      readonly deviation: number;
      readonly plausible: boolean;
    };

/**
 * Atwater reconstruction (4/4/9) as a sanity check on a transcribed label —
 * it catches the classic silent kJ/kcal mix-up. Old app lines 1589–1591.
 *
 * CODE decides plausibility, never the model (§6).
 *
 * Deliberately declines to judge a partial read: on three-of-four values it
 * would cry wolf. Also declines when either the label kcal or the estimate is
 * non-positive — a zero-calorie product (the old app's Creatine row) is not
 * implausible, it is just zero.
 */
export function atwaterCheck(
  kcal: number | null,
  pro: number | null,
  carb: number | null,
  fat: number | null,
  tolerance: number = ATWATER_TOLERANCE,
): AtwaterResult {
  if (kcal == null || pro == null || carb == null || fat == null) {
    return { checked: false, reason: "incomplete" };
  }

  const estimatedKcal = 4 * pro + 4 * carb + 9 * fat;
  if (estimatedKcal <= 0 || kcal <= 0) {
    return { checked: false, reason: "non-positive" };
  }

  const deviation = Math.abs(estimatedKcal - kcal) / kcal;
  return {
    checked: true,
    estimatedKcal,
    deviation,
    plausible: deviation <= tolerance,
  };
}
