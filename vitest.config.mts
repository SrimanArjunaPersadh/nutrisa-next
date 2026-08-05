import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirrors the `@/*` path in tsconfig.json. Hooks and components import
    // through it, so Vitest has to resolve it the same way Next does.
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    // Node by default — the engine and data layers are pure. Files that need a
    // DOM opt in per-file with `// @vitest-environment jsdom`, so one React hook
    // test does not slow every suite down.
    environment: "node",
    // BOTH extensions. `.tsx` is load-bearing from Phase 5 on: component tests
    // contain JSX and must be named `.test.tsx`. A `tests/**/*.test.ts` glob
    // (what this was until Phase 5) does NOT match `.test.tsx` — the file is
    // silently never collected and `npm test` still reports green, which is
    // worse than having no test at all. `tests/vitest-config.test.ts` pins this
    // against the real matcher so it cannot be narrowed back by accident.
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
