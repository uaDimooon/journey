import { defineConfig } from "vitest/config";

// Two projects so pure logic stays fast in Node while component tests get a real
// DOM (see docs/TESTING.md). Unit = *.test.ts (node); components = *.test.tsx
// (jsdom + React Testing Library). JSX uses the automatic runtime so tests don't
// need `import React`.
export default defineConfig({
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  test: {
    coverage: {
      provider: "v8",
      include: ["src/domain/**", "src/state/**", "src/lib/**"],
      reporter: ["text", "html"],
    },
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.{test,spec}.ts"],
        },
      },
      {
        esbuild: { jsx: "automatic", jsxImportSource: "react" },
        test: {
          name: "components",
          environment: "jsdom",
          include: ["src/**/*.{test,spec}.tsx"],
          setupFiles: ["./test/setup.components.ts"],
        },
      },
    ],
  },
});
