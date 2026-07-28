import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["node_modules/**"],
    coverage: {
      provider: "v8",
      // `cobertura` is what the CI diff-coverage gate reads; the others are for
      // humans. Keep cobertura here or the gate silently measures nothing.
      reporter: ["text", "cobertura"],
      include: ["src/**/*.ts"],
      reportsDirectory: "./coverage",
    },
  },
});
