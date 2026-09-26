import { defineConfig } from "vitest/config";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Create a temp dir for tests BEFORE any test file loads
const testDataDir = mkdtempSync(join(tmpdir(), "apmcp-test-"));

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // The e2e suite needs a real browser and minutes of runtime: vitest.e2e.config.ts.
    exclude: ["tests/e2e/**"],
    // Registry tests share testDataDir, so running their files concurrently can erase
    // another file's registry between an update and assertion.
    fileParallelism: false,
    testTimeout: 10_000,
    env: {
      APMCP_DATA_DIR: testDataDir,
    },
  },
});
