import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["evals/**/*.eval.ts"], testTimeout: 900_000, fileParallelism: false },
});
