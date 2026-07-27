import { defineConfig } from "vitest/config";

// Vitest config kept separate from vite.config.ts so the app build stays lean.
// Phase 1 tests (domain + state) are pure logic and need no DOM; component and
// browser-mode setups are added in later phases (see docs/TESTING.md).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    coverage: {
      provider: "v8",
      include: ["src/domain/**", "src/state/**", "src/lib/**"],
      reporter: ["text", "html"],
    },
  },
});
