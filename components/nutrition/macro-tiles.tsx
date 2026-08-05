/**
 * The four macro tiles, showing what is LEFT (PHASE-4-DECISIONS §2).
 *
 * Ports the tiles at 2780–2785, with one change: the old app printed the
 * consumed figure and a static range subtitle, and Plan §5.2 asks for
 * remaining-to-target. The subtraction happens in `lib/engine/day`; this file
 * only decides how to say the answer.
 *
 * "140 over" rather than "−140": a minus sign in front of a number that is
 * already about a deficit is a puzzle at 19:00 with the fridge open.
 */

import { StatTile, type TileTone } from "@/components/stat-tile";
import {
  CARB_MAX,
  CARB_MIN,
  FAT_MAX,
  FAT_MIN,
  KCAL_MAX,
  KCAL_MIN,
  PRO_MAX,
  PRO_MIN,
  macroStatus,
  remainingMacros,
  type MacroStatus,
} from "@/lib/engine/day";
import type { Macros } from "@/lib/engine/types";

/** Status → tone. The engine returns meaning; this maps meaning to colour (§1.5). */
const TONE: Record<MacroStatus, TileTone> = {
  over: "red",
  "in-range": "green",
  under: "blue",
};

/** The engine returns a signed number; the view turns the sign into words. */
function say(left: number, unit: string): { value: string; sub: string } {
  if (left < 0) {
    return { value: `${Math.abs(left)}${unit}`, sub: "over" };
  }
  return { value: `${left}${unit}`, sub: "left" };
}

export function MacroTiles({ totals }: { totals: Macros }) {
  const left = remainingMacros(totals);

  const tiles = [
    {
      label: "Calories",
      left: left.kcal,
      unit: "",
      status: macroStatus(totals.kcal, KCAL_MIN, KCAL_MAX),
    },
    {
      label: "Protein",
      left: left.pro,
      unit: "g",
      status: macroStatus(totals.pro, PRO_MIN, PRO_MAX),
    },
    {
      label: "Carbs",
      left: left.carb,
      unit: "g",
      status: macroStatus(totals.carb, CARB_MIN, CARB_MAX),
    },
    {
      label: "Fat",
      left: left.fat,
      unit: "g",
      status: macroStatus(totals.fat, FAT_MIN, FAT_MAX),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {tiles.map(({ label, left: remaining, unit, status }) => {
        const { value, sub } = say(remaining, unit);
        return (
          <StatTile
            key={label}
            label={label}
            value={value}
            sub={sub}
            tone={TONE[status]}
          />
        );
      })}
    </div>
  );
}
