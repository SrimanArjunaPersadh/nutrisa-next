"use client";

/**
 * Single-day picker. Ports the old app's `renderDatePicker` (2882–2918).
 *
 * Built on shadcn's Popover + Calendar rather than a hand-rolled dropdown. The
 * dropdown rule (Project Instructions) allows exactly this: *"or use shadcn
 * primitives that handle blur-before-click correctly."* Radix's Popover closes on
 * outside POINTERDOWN and manages focus itself, so the blur-before-click bug that
 * `onmousedown` + `preventDefault()` exists to dodge cannot arise here — there is
 * no custom blur handler to race. Escape-to-close and focus return are Radix's.
 *
 * What is ported deliberately: Monday-first weeks, today marked, the selected day
 * marked, the popup opening on the SELECTED day's month, and closing the moment a
 * day is chosen.
 */

import { CalendarIcon } from "lucide-react";
import { useState } from "react";

import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDayShort, fromIsoDay, toIsoDay } from "@/lib/date";

export type DatePickerProps = {
  /** Selected day, `YYYY-MM-DD`. */
  value: string;
  onChange: (iso: string) => void;
  /** Latest selectable day, `YYYY-MM-DD`. Weigh-ins cannot be logged in the future. */
  max?: string;
  /** Accessible name — there is no visible <label> in the old layout. */
  ariaLabel?: string;
  id?: string;
};

export function DatePicker({
  value,
  onChange,
  max,
  ariaLabel = "Choose a date",
  id,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = fromIsoDay(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        aria-label={ariaLabel}
        className="flex min-h-11 w-full items-center gap-2 rounded-card border border-border bg-bg3 px-3 text-left text-body text-text transition-colors hover:border-blue/50 focus-visible:border-blue data-[state=open]:border-blue"
      >
        <CalendarIcon className="size-4 shrink-0 text-text-3" aria-hidden />
        <span data-numeric>{formatDayShort(value)}</span>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-auto rounded-card border-border bg-bg2 p-0"
      >
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          weekStartsOn={1}
          autoFocus
          disabled={max ? { after: fromIsoDay(max) } : undefined}
          onSelect={(day) => {
            // react-day-picker hands back `undefined` when the user taps the
            // already-selected day. The old app had no way to deselect either —
            // a weigh-in always has a date — so that tap just closes.
            if (day) onChange(toIsoDay(day));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
