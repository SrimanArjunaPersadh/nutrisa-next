"use client";

/**
 * Log Weight card + Weigh-In Protocol + Weekly Averages. Ports 3058–3081.
 *
 * The date picker makes back-dating a first-class action, which is how a missed
 * morning gets corrected. `logWeight` upserts on `date`, so re-logging a day
 * REPLACES rather than duplicates (`lib/data/weights.ts`).
 */

import { useState } from "react";

import { DatePicker } from "@/components/date-picker";
import { formatDayCompact, todayIso } from "@/lib/date";
import type { Result, WeightEntry } from "@/lib/data";
import type { WeeklyAverage } from "@/lib/engine/trend";

export type LogWeightCardProps = {
  weeks: readonly WeeklyAverage[];
  onLog: (date: string, weight: number) => Promise<Result<WeightEntry>>;
};

/** Guard rails, not medical limits — a typo like `968` should not reach the DB. */
const MIN_KG = 20;
const MAX_KG = 400;

export function LogWeightCard({ weeks, onLog }: LogWeightCardProps) {
  const today = todayIso();
  const [date, setDate] = useState(today);
  const [raw, setRaw] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const weight = parseFloat(raw.replace(",", "."));
    if (!Number.isFinite(weight) || weight < MIN_KG || weight > MAX_KG) {
      setError(`Enter a weight between ${MIN_KG} and ${MAX_KG} kg.`);
      return;
    }

    setSaving(true);
    const result = await onLog(date, weight);
    setSaving(false);

    if (result.ok) {
      setRaw("");
      return;
    }
    // Never a silent revert (§4.4): say what happened and what to do.
    setError(
      result.error.kind === "network"
        ? "Couldn’t reach the server — check your signal and tap Log Weight again."
        : `Couldn’t save that weigh-in: ${result.error.message}`,
    );
  }

  return (
    <section className="rounded-card border border-border bg-bg2 p-4">
      <h2 className="text-card font-semibold text-text">Log Weight</h2>

      <form onSubmit={submit} className="mt-3 grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="weigh-in-date"
              className="text-label font-medium uppercase text-text-3"
            >
              Date
            </label>
            <div className="mt-1">
              <DatePicker
                id="weigh-in-date"
                value={date}
                onChange={setDate}
                max={today}
                ariaLabel="Weigh-in date"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="weigh-in-value"
              className="text-label font-medium uppercase text-text-3"
            >
              Weight (kg)
            </label>
            <input
              id="weigh-in-value"
              type="text"
              inputMode="decimal"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="e.g. 96.8"
              data-numeric
              className="mt-1 min-h-11 w-full rounded-card border border-border bg-bg3 px-3 text-body text-text placeholder:text-text-3 focus-visible:border-blue"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="min-h-11 rounded-btn bg-blue text-body font-semibold text-text transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Log Weight"}
        </button>

        {error && (
          <p role="alert" className="text-label text-red">
            {error}
          </p>
        )}
      </form>

      <div className="mt-4 rounded-card border border-border bg-bg3 p-3">
        <h3 className="text-label font-semibold uppercase text-text-2">
          Weigh-In Protocol
        </h3>
        <p className="mt-1 text-label leading-relaxed text-text-3">
          Every morning, same time · After bathroom, before eating · Same clothes
          or none · Trust the trend, not single spikes
        </p>
      </div>

      {weeks.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <h3 className="text-card font-semibold text-text">Weekly Averages</h3>
          <ul className="mt-2">
            {weeks.map((week) => (
              <li
                key={week.weekStart}
                className="flex items-center justify-between border-b border-border py-2 last:border-b-0"
              >
                <span className="text-label text-text-2">
                  Week of {formatDayCompact(week.weekStart)}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-label text-text-3" data-numeric>
                    {week.n} {week.n === 1 ? "entry" : "entries"}
                  </span>
                  <span className="font-display text-card text-text" data-numeric>
                    {week.avg.toFixed(1)} kg
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
