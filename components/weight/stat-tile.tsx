/**
 * One stat tile. Ports the old app's `.tile` / `.tb .tg .tr .ta` variants
 * (3019–3027, 3052–3057).
 *
 * Colour here is meaning, never decoration (§1.5): green is loss, red is gain,
 * amber is a caution, blue is the app's primary. A tile picks its tone from what
 * the NUMBER says, so the tone is computed by the caller, not chosen for looks.
 */

export type TileTone = "neutral" | "blue" | "green" | "red" | "amber";

const TONE: Record<TileTone, { border: string; value: string }> = {
  neutral: { border: "border-border", value: "text-text" },
  blue: { border: "border-blue/30", value: "text-blue" },
  green: { border: "border-green/30", value: "text-green" },
  red: { border: "border-red/30", value: "text-red" },
  amber: { border: "border-amber/30", value: "text-amber" },
};

export type StatTileProps = {
  label: string;
  /** Pre-formatted by the caller — the engine returns numbers, the view formats them. */
  value: string;
  unit?: string;
  sub?: string;
  tone?: TileTone;
};

export function StatTile({
  label,
  value,
  unit,
  sub,
  tone = "neutral",
}: StatTileProps) {
  const t = TONE[tone];

  return (
    <div className={`rounded-card border ${t.border} bg-bg2 p-3`}>
      <div className="text-label font-medium uppercase text-text-3">{label}</div>
      <div className={`mt-1 font-display text-section ${t.value}`} data-numeric>
        {value}
        {unit && (
          <span className="ml-0.5 text-label font-normal not-italic text-text-3">
            {unit}
          </span>
        )}
      </div>
      {sub && <div className="mt-0.5 text-label text-text-3">{sub}</div>}
    </div>
  );
}
