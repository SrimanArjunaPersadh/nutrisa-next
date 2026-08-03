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
    include: ["tests/**/*.test.ts"],
  },
});
