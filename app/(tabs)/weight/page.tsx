"use client";

/**
 * The Weight tab — "trend, not noise" (Plan §5.3). Ports `vW()` (2982–3104).
 *
 * THE RULE THIS PAGE EXISTS TO KEEP: the engine always receives the FULL series.
 * `filterWeights` narrows what is drawn and what the period tiles describe, and
 * nothing else. Smoothing needs all past data, so a filtered slice handed to
 * `trendWeight` or `weeklyRateAt` produces a plausible, wrong number with no
 * error anywhere (PHASE-3-DECISIONS §2).
 *
 * Layout is single-column on a phone and two columns from `md` up.
 */

import { useCallback, useMemo, useState } from "react";

import { RangePicker } from "@/components/range-picker";
import { UndoToast, type ToastMessage } from "@/components/undo-toast";
import { HistoryCard } from "@/components/weight/history-card";
import { LogWeightCard } from "@/components/weight/log-weight-card";
import { StatTile, type TileTone } from "@/components/weight/stat-tile";
import { WeightFilterTabs } from "@/components/weight/weight-filter-tabs";
import { formatDayCompact, formatDayShort, toIsoDay, todayIso } from "@/lib/date";
import {
  GOAL_KG,
  eta,
  trendWeight,
  weeklyAverages,
  weeklyRateAt,
} from "@/lib/engine/trend";
import type { WeightEntry } from "@/lib/engine/types";
import { useWeights } from "@/lib/hooks/useWeights";
import {
  DEFAULT_FILTER,
  filterLabel,
  filterWeights,
  type WeightFilter,
} from "@/lib/weight-filter";

/** The engine returns numbers; every string below is formatted here. */
const kg = (n: number) => n.toFixed(1);

export default function WeightPage() {
  const { weights, state, error, refetch, log, remove } = useWeights();
  const [filter, setFilter] = useState<WeightFilter>(DEFAULT_FILTER);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const today = todayIso();

  const view = useMemo(() => {
    // FULL series in, always.
    const trend = trendWeight(weights);
    const filtered = filterWeights(weights, filter, today);
    const lastFiltered = filtered.at(-1) ?? null;

    // The trend value for the last day IN VIEW, looked up in the full line —
    // never recomputed from `filtered` (old app 2989–2991).
    const trendLast = lastFiltered
      ? (trend.find((p) => p.date === lastFiltered.date) ?? null)
      : null;

    // Old app's caller guard (2995): the rate is blank when the VISIBLE window
    // holds fewer than two entries, even though the full trend could answer.
    const rate =
      filtered.length >= 2 && lastFiltered
        ? weeklyRateAt(weights, lastFiltered.date)
        : null;

    const values = filtered.map((e) => e.weight);
    // CARRIED-FORWARD QUIRK (old app 2986): "Current" is the latest weigh-in of
    // the FULL series, while Change/Average/Min/Max describe the filtered
    // window. Filter to a past month and Current still shows today's weight.
    const current = weights.at(-1)?.weight ?? null;

    return {
      trend,
      filtered,
      trendLast,
      rate,
      current,
      average: values.length
        ? values.reduce((a, b) => a + b, 0) / values.length
        : null,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      change:
        filtered.length >= 2
          ? filtered[filtered.length - 1].weight - filtered[0].weight
          : null,
      startLabel: filtered.length ? formatDayCompact(filtered[0].date) : null,
      weeks: weeklyAverages(filtered),
      goalEta: eta(weights, new Date()),
    };
  }, [weights, filter, today]);

  const undoDelete = useCallback(
    async (entry: WeightEntry) => {
      const result = await log(entry.date, entry.weight);
      if (!result.ok) {
        setToast({
          text: `Couldn’t restore that weigh-in: ${result.error.message}`,
          tone: "error",
        });
      }
    },
    [log],
  );

  const handleDelete = useCallback(
    async (entry: WeightEntry) => {
      setDeleting(entry.date);
      const result = await remove(entry.date);
      setDeleting(null);

      if (!result.ok) {
        setToast({
          text:
            result.error.kind === "network"
              ? "Couldn’t reach the server — that weigh-in was not deleted."
              : `Couldn’t delete that weigh-in: ${result.error.message}`,
          tone: "error",
        });
        return;
      }

      setToast({
        text: `Deleted ${formatDayCompact(entry.date)} · ${kg(entry.weight)} kg`,
        tone: "info",
        action: { label: "Undo", onClick: () => void undoDelete(entry) },
      });
    },
    [remove, undoDelete],
  );

  const dismissToast = useCallback(() => setToast(null), []);

  return (
    <main className="px-4 pb-8 pt-4">
      <header>
        <h1 className="font-display text-title text-text">Weight Tracker</h1>
        <p className="mt-0.5 text-label text-text-3">
          Log every morning · trend weight smooths daily noise
        </p>
      </header>

      {state === "loading" && <LoadingState />}

      {state === "error" && (
        <ErrorState message={error?.message ?? "Unknown error"} onRetry={refetch} />
      )}

      {state === "empty" && (
        <div className="mt-4 grid gap-4">
          <EmptyState />
          <LogWeightCard weeks={[]} onLog={log} />
        </div>
      )}

      {state === "ready" && (
        <div className="mt-4 grid gap-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile
              label="Current"
              value={view.current === null ? "—" : kg(view.current)}
              unit="kg"
            />
            <StatTile
              label="Trend Weight"
              value={
                view.trendLast
                  ? kg(view.trendLast.tw)
                  : view.filtered.at(-1)
                    ? kg(view.filtered[view.filtered.length - 1].weight)
                    : "—"
              }
              unit="kg"
              sub="Smoothed avg"
              tone="blue"
            />
            <StatTile
              label="Change"
              value={
                view.change === null
                  ? "—"
                  : `${view.change < 0 ? "▼ " : "▲ "}${kg(Math.abs(view.change))}`
              }
              unit="kg"
              sub={view.startLabel ? `since ${view.startLabel}` : undefined}
              tone={changeTone(view.change)}
            />
            <StatTile
              label="Weekly Rate"
              value={
                view.rate === null
                  ? "—"
                  : `${view.rate < 0 ? "▼ " : "▲ "}${Math.abs(view.rate).toFixed(2)}`
              }
              unit="kg/wk"
              tone={view.rate === null ? "neutral" : view.rate < 0 ? "green" : "amber"}
            />
          </div>

          <section className="rounded-card border border-border bg-bg2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-card font-semibold text-text">Daily Weight</h2>
              <WeightFilterTabs filter={filter} onChange={setFilter} />
            </div>

            {filter.kind === "custom" && (
              <div className="mt-3">
                <RangePicker
                  from={filter.from}
                  to={filter.to}
                  max={today}
                  onApply={(from, to) => setFilter({ kind: "custom", from, to })}
                  onReset={() => setFilter({ kind: "custom", from: "", to: "" })}
                />
              </div>
            )}

            {/* The chart lands in the next step of Phase 3. The filter above is
                already live, and the tiles and history below react to it. */}
            <div className="mt-3 grid h-40 place-items-center rounded-card border border-dashed border-border bg-bg3">
              <p className="text-label text-text-3">
                Chart arrives next — filter is live
              </p>
            </div>
          </section>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile
              label="Average"
              value={view.average === null ? "—" : kg(view.average)}
              unit="kg"
              sub={`${view.filtered.length} in ${filterLabel(filter)}`}
            />
            <StatTile
              label="Minimum"
              value={view.min === null ? "—" : kg(view.min)}
              unit="kg"
              tone="green"
            />
            <StatTile
              label="Maximum"
              value={view.max === null ? "—" : kg(view.max)}
              unit="kg"
              tone="red"
            />
            <StatTile
              label="To Goal"
              value={
                view.current === null
                  ? "—"
                  : kg(Math.max(0, view.current - GOAL_KG))
              }
              unit="kg"
              sub={etaLabel(view.goalEta)}
              tone="amber"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <LogWeightCard weeks={view.weeks} onLog={log} />
            <HistoryCard
              entries={view.filtered}
              trend={view.trend}
              onDelete={(entry) => void handleDelete(entry)}
              deleting={deleting}
            />
          </div>
        </div>
      )}

      <UndoToast message={toast} onDismiss={dismissToast} />
    </main>
  );
}

/** Loss is green, gain is red — colour is meaning (§1.5). */
function changeTone(change: number | null): TileTone {
  if (change === null) return "neutral";
  return change < 0 ? "green" : "red";
}

function etaLabel(result: ReturnType<typeof eta>): string {
  switch (result.kind) {
    case "no-data":
      return "no weigh-ins yet";
    case "reached":
      return "Goal reached!";
    case "projected":
      return formatDayShort(toIsoDay(result.date));
  }
}

/** Skeletons are --bg3, never a spinner-as-personality (§4.4). */
function LoadingState() {
  return (
    <div className="mt-4 grid gap-4" aria-busy="true" aria-label="Loading weigh-ins">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-card border border-border bg-bg3"
          />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-card border border-border bg-bg3" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-72 animate-pulse rounded-card border border-border bg-bg3" />
        <div className="h-72 animate-pulse rounded-card border border-border bg-bg3" />
      </div>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <section
      role="alert"
      className="mt-4 rounded-card border border-red/40 bg-bg2 p-4"
    >
      <h2 className="text-card font-semibold text-text">
        Couldn’t load your weigh-ins
      </h2>
      <p className="mt-1 text-body text-text-2">
        Nothing was lost — this is a read problem, not your data. Check your
        signal and try again.
      </p>
      <p className="mt-2 text-label text-text-3">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 min-h-11 rounded-btn bg-blue px-4 text-body font-semibold text-text transition-opacity hover:opacity-90"
      >
        Try again
      </button>
    </section>
  );
}

function EmptyState() {
  return (
    <section className="rounded-card border border-border bg-bg2 p-4">
      <h2 className="text-card font-semibold text-text">
        Log your first weigh-in
      </h2>
      <p className="mt-1 text-body text-text-2">
        The trend line needs a starting point. Weigh in tomorrow morning — same
        time, after the bathroom, before eating — and the chart begins.
      </p>
      <p className="mt-2 text-label text-text-3">
        One reading is a data point. It takes about a week before the trend means
        anything, and that is the number this app defends.
      </p>
    </section>
  );
}
