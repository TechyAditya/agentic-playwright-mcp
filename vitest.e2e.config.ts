import { defineConfig } from "vitest/config";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Keep the tab-group registry out of the developer's real ~/.agentic-playwright-mcp.
// The spawned MCP servers inherit this.
const testDataDir = mkdtempSync(join(tmpdir(), "apmcp-e2e-"));

/**
 * End-to-end suite: drives the built server over stdio against the shared Chrome
 * daemon, so it needs a real browser and is far slower than the unit tests.
 * Run with `npm run test:e2e`; `npm test` stays unit-only.
 */
export default defineConfig({
  test: {
    include: ["tests/e2e/**/*.e2e.test.ts"],
    // Each spec owns a tab group in one shared Chrome. Serial keeps timing-sensitive
    // steps (dialog auto-dismiss, drag) reliable; the groups mean parallel is safe too.
    fileParallelism: false,
    testTimeout: 90_000,
    hookTimeout: 120_000,
    teardownTimeout: 30_000,
    retry: 1,
    env: {
      APMCP_DATA_DIR: testDataDir,
    },
  },
});
