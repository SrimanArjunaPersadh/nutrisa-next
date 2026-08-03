"use client";

/**
 * Custom date-range picker for the Weight page's filter. Ports the old app's
 * `renderRangePicker` (2937–2979) and `pickRangeDate` (2921–2925).
 *
 * INLINE, not a popover — the old app renders it in the flow of the chart card,
 * replacing the "from → to" summary line while it is open.
 *
 * DRAFT-THEN-COMMIT is the behaviour worth preserving: tapping days edits a draft
 * only. Nothing filters the chart until "Set Range" is pressed. That is why the
 * old app keeps `S.wpick` separate from `S.wfrom`/`S.wto`, and why this component
 * holds its own state rather than lifting every tap.
 *
 * Two-tap semantics come from react-day-picker's range mode, which matches the
 * old `pickRangeDate` rule — first tap starts a new range, second closes it, a
 * third starts over — and normalises a backwards pick, which the old app did by
 * hand with its `lo`/`hi` swap (2944–2945).
 */

import { useState } from "react";
import type { DateRange } from "react-day-picker";

import { Calendar } from "@/components/ui/calendar";
import { formatDayShort, fromIsoDay, toIsoDay } from "@/lib/date";

export type RangePickerProps = {
  /** Currently APPLIED range, `YYYY-MM-DD` or `""`. Seeds the draft. */
  from: string;
  to: string;
  /** Latest selectable day. */
  max?: string;
  /** Commit the draft — the old app's "Set Range". */
  onApply: (from: string, to: string) => void;
  /** Clear draft AND applied range — the old app's "Reset". */
  onReset: () => void;
};

const toDraft = (from: string, to: string): DateRange | undefined =>
  from ? { from: fromIsoDay(from), to: to ? fromIsoDay(to) : undefined } : undefined;

export function RangePicker({
  from,
  to,
  max,
  onApply,
  onReset,
}: RangePickerProps) {
  const [draft, setDraft] = useState<DateRange | undefined>(toDraft(from, to));

  const draftFrom = draft?.from ? toIsoDay(draft.from) : "";
  const draftTo = draft?.to ? toIsoDay(draft.to) : "";
  const complete = Boolean(draftFrom && draftTo);

  return (
    <div className="mb-4 rounded-card border border-border bg-bg3 p-3">
      <Calendar
        mode="range"
        selected={draft}
        defaultMonth={draft?.from ?? (from ? fromIsoDay(from) : undefined)}
        weekStartsOn={1}
        disabled={max ? { after: fromIsoDay(max) } : undefined}
        onSelect={setDraft}
        className="w-full"
      />

      {/* The status line tells the user which tap comes next — the old app's
          `status` string (2958–2960). Never silent about what it is waiting for. */}
      <p className="mt-2 text-label text-text-3" aria-live="polite">
        {!draftFrom ? (
          "Tap a start date"
        ) : !draftTo ? (
          <>
            <span className="text-blue" data-numeric>
              {formatDayShort(draftFrom)}
            </span>{" "}
            → tap end date
          </>
        ) : (
          <>
            <span className="text-blue" data-numeric>
              {formatDayShort(draftFrom)}
            </span>{" "}
            →{" "}
            <span className="text-blue" data-numeric>
              {formatDayShort(draftTo)}
            </span>
          </>
        )}
      </p>

      {complete && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => onApply(draftFrom, draftTo)}
            className="min-h-11 flex-1 rounded-btn bg-blue text-body font-semibold text-text transition-opacity hover:opacity-90"
          >
            Set Range
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(undefined);
              onReset();
            }}
            className="min-h-11 rounded-btn border border-border px-4 text-body text-text-3 transition-colors hover:border-text-3 hover:text-text-2"
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
}
