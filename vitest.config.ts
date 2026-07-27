import { defineConfig } from "vitest/config";

// Two projects so pure logic stays fast in Node while component tests get a real
// DOM (see docs/TESTING.md). Unit = *.test.ts (node); components = *.test.tsx
// (jsdom + React Testing Library). JSX uses the automatic runtime so tests don't
// need `import React`. Storybook is a standalone workbench (npm run storybook),
// intentionally NOT wired into this fast core run.
export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react"
  },
  test: {
    coverage: {
      provider: "v8",
      include: ["src/domain/**", "src/state/**", "src/lib/**"],
      reporter: ["text", "html"],
      // Floor thresholds on the pure core (diagnostic + ratchet, not a target —
      // see docs/TESTING.md). Raise these as coverage grows; never lower them.
      thresholds: {
        statements: 35,
        branches: 80,
        functions: 47,
        lines: 35
      }
    },
    projects: [{
      test: {
        name: "unit",
        environment: "node",
        include: ["src/**/*.{test,spec}.ts"]
      }
    }, {
      esbuild: {
        jsx: "automatic",
        jsxImportSource: "react"
      },
      test: {
        name: "components",
        environment: "jsdom",
        include: ["src/**/*.{test,spec}.tsx"],
        setupFiles: ["./test/setup.components.ts"]
      }
    }]
  }
});