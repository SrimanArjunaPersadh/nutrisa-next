"use client";

/**
 * Week / Month / All / Custom, plus the month selector. Ports 3032–3044.
 *
 * The month `<input type="month">` is kept native, exactly as the old app had
 * it: the OS month wheel is better on a phone than anything we would build, and
 * it is not a custom dropdown so the dropdown rule does not apply to it.
 */

import { monthOf, type WeightFilter } from "@/lib/weight-filter";
import { todayIso } from "@/lib/date";

const TABS = [
  { kind: "week", label: "Week" },
  { kind: "month", label: "Month" },
  { kind: "all", label: "All" },
  { kind: "custom", label: "Custom" },
] as const;

export type WeightFilterTabsProps = {
  filter: WeightFilter;
  onChange: (filter: WeightFilter) => void;
};

export function WeightFilterTabs({ filter, onChange }: WeightFilterTabsProps) {
  const ym = filter.kind === "month" ? filter.ym : monthOf(todayIso());

  function select(kind: (typeof TABS)[number]["kind"]) {
    switch (kind) {
      case "week":
        return onChange({ kind: "week" });
      case "all":
        return onChange({ kind: "all" });
      case "month":
        return onChange({ kind: "month", ym });
      case "custom":
        return onChange({ kind: "custom", from: "", to: "" });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        className="flex gap-1 rounded-btn bg-bg3 p-1"
        role="group"
        aria-label="Chart period"
      >
        {TABS.map(({ kind, label }) => {
          const active = filter.kind === kind;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => select(kind)}
              aria-pressed={active}
              className={`min-h-11 rounded-btn px-3 text-label font-medium uppercase transition-colors ${
                active ? "bg-blue text-text" : "text-text-3 hover:text-text-2"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {filter.kind === "month" && (
        <input
          type="month"
          value={filter.ym}
          max={monthOf(todayIso())}
          onChange={(e) =>
            e.target.value && onChange({ kind: "month", ym: e.target.value })
          }
          aria-label="View a different month"
          className="min-h-11 rounded-btn border border-border bg-bg3 px-2 text-label text-text"
          data-numeric
        />
      )}
    </div>
  );
}
