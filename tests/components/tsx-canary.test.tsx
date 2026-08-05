// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

/**
 * THE CANARY. The first `.test.tsx` file in this repo.
 *
 * Two jobs, both about the pipeline rather than about any feature:
 *
 * 1. **It proves the toolchain works end to end** — JSX transform, jsdom
 *    environment, testing-library render — BEFORE Phase 5's real component
 *    tests depend on all three. `@testing-library/react` and `jsdom` have been
 *    installed and unused since Phase 0; this is the first thing to exercise
 *    them together.
 *
 * 2. **It is the file `tests/vitest-config.test.ts` looks for.** That test globs
 *    the filesystem with the runner's own `include` patterns and asserts this
 *    path comes back. If the glob is ever narrowed to `*.test.ts` again, this
 *    file stops being collected — and the config test fails loudly instead of
 *    the suite silently shrinking.
 *
 * Keep it trivial. It is infrastructure, not coverage.
 *
 * NOTE FOR COMPONENT TESTS THAT FOLLOW: `@testing-library/jest-dom` is NOT
 * installed, so its matchers (`toBeInTheDocument`, `toHaveTextContent`,
 * `toHaveFocus`, `toBeDisabled`) are unavailable. Assert on the DOM directly —
 * `el.textContent`, `document.activeElement`, `el.disabled`. Everything Phase 5
 * needs is reachable that way; adding the package is a separate call.
 */

function Canary({ label }: { label: string }) {
  return <p data-testid="canary">{label}</p>;
}

describe("tsx canary", () => {
  it("renders JSX in jsdom", () => {
    render(<Canary label="alive" />);
    expect(screen.getByTestId("canary").textContent).toBe("alive");
  });

  it("has a real DOM to render into", () => {
    // If the `// @vitest-environment jsdom` pragma stops being honoured, this
    // is where it surfaces, rather than inside a component test where it would
    // look like a component bug.
    expect(typeof document).toBe("object");
    expect(document.body).toBeTruthy();
  });
});
