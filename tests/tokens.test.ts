import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Phase 0 smoke test — the token contract (Migration Plan §4.1).
 *
 * This is deliberately not a trivial `expect(true)`. It mechanically enforces
 * the two rules that keep the design system from drifting once components start
 * landing in Phase 3+:
 *
 *   1. Every hex is written exactly ONCE, in globals.css.
 *   2. The bare-name alias layer references those tokens; it never restates hex.
 *
 * The §6 deterministic-engine suite arrives in Phase 1. This file is the
 * infrastructure that suite plugs into.
 */

const CSS = readFileSync(
  path.join(process.cwd(), "app", "globals.css"),
  "utf8",
);

const HEX = /#[0-9a-fA-F]{3,8}\b/g;

/** The token names CLAUDE.md commits to. Renaming one breaks this test. */
const REQUIRED_TOKENS = [
  "--color-bg",
  "--color-bg2",
  "--color-bg3",
  "--color-border",
  "--color-text",
  "--color-text-2",
  "--color-text-3",
  "--color-blue",
  "--color-green",
  "--color-red",
  "--color-amber",
  "--color-protein",
  "--color-carbs",
  "--color-fats",
];

/** The bare aliases raw-CSS and Chart.js consumers read. */
const REQUIRED_ALIASES = [
  "--bg",
  "--bg2",
  "--bg3",
  "--border",
  "--text",
  "--text-2",
  "--text-3",
  "--blue",
  "--green",
  "--red",
  "--amber",
  "--protein",
  "--carbs",
  "--fats",
];

function rootAliasBlock(): string {
  const start = CSS.indexOf(":root {");
  expect(start, "globals.css must contain a :root alias block").toBeGreaterThan(
    -1,
  );
  const end = CSS.indexOf("}", start);
  return CSS.slice(start, end);
}

describe("design tokens", () => {
  it("declares every token CLAUDE.md names", () => {
    for (const token of REQUIRED_TOKENS) {
      expect(CSS, `missing token ${token}`).toContain(`${token}:`);
    }
  });

  it("writes each hex value exactly once", () => {
    const counts = new Map<string, number>();
    for (const hex of CSS.match(HEX) ?? []) {
      const key = hex.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const duplicated = [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([hex, count]) => `${hex} (${count}x)`);

    expect(
      duplicated,
      `hex must be written once — these repeat: ${duplicated.join(", ")}`,
    ).toEqual([]);
  });

  it("exposes bare-name aliases as var() references, never re-typed hex", () => {
    const block = rootAliasBlock();

    for (const alias of REQUIRED_ALIASES) {
      const declaration = new RegExp(
        `${alias.replace(/-/g, "\\-")}:\\s*var\\(--[a-z0-9-]+\\)`,
      );
      expect(
        declaration.test(block),
        `${alias} must be declared as a var() reference`,
      ).toBe(true);
    }

    expect(
      block.match(HEX),
      "the :root alias block must contain no hex at all",
    ).toBeNull();
  });

  it("reserves the three macro colours", () => {
    for (const macro of ["--color-protein", "--color-carbs", "--color-fats"]) {
      expect(CSS).toContain(macro);
    }
  });
});
