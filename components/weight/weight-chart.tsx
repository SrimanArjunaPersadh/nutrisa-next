"use client";

/**
 * The weight chart. Ports `bDS()` (3656–3669), `mO()` (3671–3673), `wC()`
 * (3749–3753) and the shared `CG`/`wTT` config (2398–2412).
 *
 * FOUR datasets, not the old app's three — the trend line is the one addition
 * Phase 3 makes (PHASE-3-DECISIONS §1), and it takes `--blue` while raw daily
 * recedes to `--text-3` (§5). "Trend, not noise" made literal.
 *
 * THE ZOOM FIX (§2). Every series drawn here is computed from the FULL history
 * and only then sliced to the visible window: `trend` and `targetLine` anchor to
 * the all-time first weigh-in, and `weightDirections` compares each dot to its
 * TRUE predecessor. `visible` decides what is DRAWN and nothing else. Handing any
 * of these the filtered slice produces a plausible, wrong picture with no error
 * anywhere.
 *
 * NO HEX LIVES HERE (§4). Every colour is read from the live CSS custom
 * properties at paint time — which is the entire reason Phase 0 aliased the bare
 * `--blue` / `--green` / `--text-3` names in `:root` as `var()` references.
 */

import {
  CategoryScale,
  Chart,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { useEffect, useMemo, useRef } from "react";

import {
  GOAL_KG,
  targetLine,
  weightDirections,
  type WeightDirection,
} from "@/lib/engine/trend";
import type { TrendPoint, WeightEntry } from "@/lib/engine/types";

// Registered explicitly rather than importing `chart.js/auto`, which pulls in
// every controller (bar, pie, radar…) for a line chart. Module scope: registering
// twice is harmless, but there is no reason to do it per render.
Chart.register(
  CategoryScale,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
);

/** Read a design token's live value. Never a hex literal — see the file header. */
function token(styles: CSSStyleDeclaration, name: string): string {
  return styles.getPropertyValue(name).trim();
}

/**
 * The same colour at a given opacity, for grid lines.
 *
 * The old app wrote its grids as 8-digit hex (`#1A1E2955`). We cannot: hex lives
 * only in `globals.css`. `getComputedStyle` hands back either `#rrggbb` or
 * `rgb(r g b)` depending on the browser, so both are parsed and re-emitted as
 * `rgba()`, which every canvas implementation accepts.
 */
function withAlpha(color: string, alpha: number): string {
  const hex = color.match(/^#([0-9a-f]{3,8})$/i)?.[1];
  if (hex) {
    const full =
      hex.length <= 4
        ? hex
            .slice(0, 3)
            .split("")
            .map((c) => c + c)
            .join("")
        : hex.slice(0, 6);
    const n = parseInt(full, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }

  const parts = color.match(/-?\d+\.?\d*/g);
  if (parts && parts.length >= 3) {
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
  }

  // A token that did not resolve. Draw nothing rather than draw a wrong colour.
  return "transparent";
}

/** Old app: `i===0 ? BLUE : down ? GREEN : up ? RED : BLUE` (3660). */
function dotColour(
  direction: WeightDirection,
  c: { blue: string; green: string; red: string },
): string {
  switch (direction) {
    case "down":
      return c.green;
    case "up":
      return c.red;
    case "first":
    case "flat":
      return c.blue;
  }
}

export type WeightChartProps = {
  /** The FULL history. Every computed series anchors to this. */
  full: readonly WeightEntry[];
  /** The filtered window — what actually gets drawn. */
  visible: readonly WeightEntry[];
  /** `trendWeight(full)`, already computed by the page. Never recomputed here. */
  trend: readonly TrendPoint[];
};

export function WeightChart({ full, visible, trend }: WeightChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const series = useMemo(() => {
    const dates = visible.map((e) => e.date);
    const byDate = new Map(trend.map((p) => [p.date, p.tw]));

    return {
      dates,
      // `.slice(5)` → "MM-DD", the old app's label format (3663).
      labels: dates.map((d) => d.slice(5)),
      raw: visible.map((e) => e.weight),
      // Sliced from the full trend, never recomputed from `visible`.
      trend: dates.map((d) => byDate.get(d) ?? null),
      target: targetLine(full, dates),
      directions: weightDirections(full, dates),
    };
  }, [full, visible, trend]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || series.dates.length === 0) return;

    const styles = getComputedStyle(document.documentElement);
    const c = {
      blue: token(styles, "--blue"),
      green: token(styles, "--green"),
      red: token(styles, "--red"),
      amber: token(styles, "--amber"),
      text: token(styles, "--text"),
      text2: token(styles, "--text-2"),
      text3: token(styles, "--text-3"),
      bg3: token(styles, "--bg3"),
      border: token(styles, "--border"),
    };

    const dots = series.directions.map((d) => dotColour(d, c));

    // Old `mO()` (3671) sized the axis from the visible RAW weights alone. With
    // a trend line added (§1) that clips it: in a Week view the trend still
    // carries months of history and can sit well above the week's heaviest
    // reading. The in-window trend values join the calculation so the added line
    // is always on screen. Target and goal keep the old app's clipping — over a
    // long window the target descends off the bottom by design.
    const inView = [
      ...series.raw,
      ...series.trend.filter((v): v is number => v !== null),
    ];

    // Ticks use the BODY face. Barlow Condensed is loaded in exactly one cut —
    // 800 italic (CLAUDE.md §4.2) — so asking canvas for it at weight 600 gets a
    // faux-synthesised upright. The old app's `family:'Barlow Condensed'` had the
    // same problem and nobody noticed at 10px.
    const tickFont = {
      size: 10,
      family: token(styles, "--font-body"),
      weight: 600 as const,
    };

    const chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: series.labels,
        datasets: [
          {
            label: "Daily weight",
            data: series.raw,
            borderColor: c.text3,
            borderWidth: 1.2,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: dots,
            pointBorderColor: dots,
            pointHoverBackgroundColor: dots,
            tension: 0.25,
            fill: false,
          },
          {
            label: "Trend",
            data: series.trend,
            borderColor: c.blue,
            borderWidth: 2.2,
            pointRadius: 0,
            pointHoverRadius: 0,
            tension: 0.25,
            fill: false,
          },
          {
            label: "Target −0.5kg/wk",
            data: series.target,
            borderColor: c.amber,
            borderWidth: 1.5,
            borderDash: [5, 4],
            pointRadius: 0,
            pointHoverRadius: 0,
            tension: 0.3,
            fill: false,
          },
          {
            label: `${GOAL_KG}kg goal`,
            data: series.dates.map(() => GOAL_KG),
            borderColor: c.green,
            borderWidth: 1,
            borderDash: [3, 6],
            pointRadius: 0,
            pointHoverRadius: 0,
            tension: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        // The legend is rendered in the DOM below, where it is real text a
        // screen reader can reach. Old app did the same (3046–3050).
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: c.bg3,
            titleColor: c.text,
            bodyColor: c.text2,
            borderColor: c.border,
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
            mode: "index",
            intersect: false,
            // Daily only, exactly as the old app (2402). The trend's value is
            // already a tile; a two-line tooltip on a phone covers the chart.
            filter: (item) => item.datasetIndex === 0,
            callbacks: {
              title: (items) => items[0].label,
              // `parsed.y` is nullable in Chart.js' types (a gap in a series).
              // Dataset 0 never has one, but say nothing rather than "0.0 kg".
              label: (item) =>
                item.parsed.y === null ? "" : `${item.parsed.y.toFixed(1)} kg`,
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color: c.text3,
              font: tickFont,
              maxRotation: 0,
              maxTicksLimit: 10,
            },
            grid: { color: withAlpha(c.bg3, 0.33) },
          },
          y: {
            min: Math.min(GOAL_KG - 1, ...inView) - 0.5,
            max: Math.max(...inView) + 0.5,
            ticks: {
              color: c.text3,
              font: tickFont,
              callback: (value) => Number(value).toFixed(1),
            },
            grid: { color: withAlpha(c.bg3, 0.33) },
          },
        },
      },
    });

    return () => chart.destroy();
  }, [series]);

  if (series.dates.length === 0) {
    return (
      <div className="mt-3 grid h-[260px] place-items-center rounded-card border border-dashed border-border bg-bg3 px-4 text-center">
        <p className="text-label text-text-3">
          No weigh-ins in this window. Widen the range, or pick All.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mt-3 h-[260px]">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Weight chart, ${series.dates.length} weigh-ins from ${series.dates[0]} to ${series.dates[series.dates.length - 1]}. The history list below carries the same readings.`}
        />
      </div>
      <Legend />
    </>
  );
}

/** Four items now the trend line exists (§5). Swatches read the same tokens. */
function Legend() {
  const items = [
    { label: "Daily weight", swatch: "bg-text-3" },
    { label: "Trend", swatch: "bg-blue" },
    { label: "Target −0.5kg/wk", swatch: "bg-amber" },
    { label: `${GOAL_KG}kg goal`, swatch: "bg-green" },
  ];

  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map(({ label, swatch }) => (
        <li key={label} className="flex items-center gap-1.5 text-label text-text-3">
          <span className={`h-0.5 w-3 rounded-btn ${swatch}`} aria-hidden />
          {label}
        </li>
      ))}
    </ul>
  );
}
