import { fileURLToPath } from "node:url";

import { globSync } from "tinyglobby";
import { describe, expect, it } from "vitest";

/**
 * The test runner's own collection glob, pinned against the real filesystem.
 *
 * WHY THIS FILE EXISTS. Until Phase 5 the glob was `tests/**\/*.test.ts`, which
 * does not match `.test.tsx`. Every phase up to 4 tested pure functions and
 * hooks, so nobody noticed. Phase 5 ships the first component tests, and JSX has
 * to live in a `.tsx` file. Under the old glob such a file is never collected —
 * no error, no warning, `npm test` still green. A suite that silently does not
 * run is worse than no suite, because it produces confidence instead of
 * coverage.
 *
 * Same instinct as `tests/tokens.test.ts`: a rule that matters and would
 * otherwise be enforced by nothing gets a test that fails loudly.
 *
 * This does not inspect the config text or reimplement matching. It reads the
 * `include` patterns the runner will actually use, then globs the real
 * repository with `tinyglobby` — the library Vitest itself globs with — and
 * asserts the resulting file list contains what it must.
 */

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * The runner's `include` patterns.
 *
 * The path is held in a variable on purpose: TypeScript rejects a LITERAL
 * import specifier ending in `.mts` unless `allowImportingTsExtensions` is on,
 * and turning that on project-wide to satisfy one test is the tail wagging the
 * dog. A non-literal specifier is not extension-checked, and the runtime import
 * is identical.
 */
async function includePatterns(): Promise<string[]> {
  const configPath = "../vitest.config.mts";
  const mod = (await import(configPath)) as {
    default?: { test?: { include?: string[] } };
  };
  return mod.default?.test?.include ?? [];
}

/** Every file the runner would collect, repo-relative, with forward slashes. */
function collectedFiles(patterns: string[]): string[] {
  return globSync(patterns, { cwd: REPO_ROOT, absolute: false }).map((p) =>
    p.replace(/\\/g, "/"),
  );
}

describe("vitest include glob", () => {
  it("is configured at all", async () => {
    expect((await includePatterns()).length).toBeGreaterThan(0);
  });

  it("collects the existing .test.ts suites", async () => {
    const files = collectedFiles(await includePatterns());

    expect(files).toContain("tests/engine/trend.test.ts");
    expect(files).toContain("tests/data/mappers.test.ts");
    expect(files).toContain("tests/hooks/useWeights.test.ts");
  });

  it("collects .test.tsx — component tests, from Phase 5 on", async () => {
    // If this fails, component tests are being silently skipped. Widen
    // `include` in vitest.config.mts. Do NOT delete this assertion, and do not
    // delete tests/components/tsx-canary.test.tsx — it is what this looks for.
    const files = collectedFiles(await includePatterns());

    expect(files).toContain("tests/components/tsx-canary.test.tsx");
  });

  it("collects every .test.tsx that exists, not just the canary", async () => {
    // Guards the narrower failure where someone adds `tests/components/*.tsx`
    // as a special case instead of widening the extension properly.
    const patterns = await includePatterns();
    const collected = new Set(collectedFiles(patterns));
    const everyTsxTest = globSync(["tests/**/*.test.tsx"], {
      cwd: REPO_ROOT,
      absolute: false,
    }).map((p) => p.replace(/\\/g, "/"));

    expect(everyTsxTest.length).toBeGreaterThan(0);
    for (const file of everyTsxTest) {
      expect(collected.has(file), `${file} is not collected by the runner`).toBe(
        true,
      );
    }
  });

  it("does not collect helpers that merely live in tests/", async () => {
    // `tests/data/fakeSupabase.ts` is a helper, not a suite. Collecting it
    // would fail the run with "no test suite found".
    const files = collectedFiles(await includePatterns());

    expect(files).not.toContain("tests/data/fakeSupabase.ts");
  });
});
