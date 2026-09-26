import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpTestClient } from "./helpers/mcp-client.js";
import { TOOL_COVERAGE } from "./helpers/tool-coverage.js";

const e2eDir = dirname(fileURLToPath(import.meta.url));

describe("tool coverage", () => {
  let client: McpTestClient;
  let registered: string[];

  beforeAll(async () => {
    client = new McpTestClient();
    await client.start();
    registered = await client.listToolNames();
  });

  afterAll(async () => {
    await client?.stop();
  });

  it("has a spec for every registered tool", () => {
    const untested = registered.filter((tool) => !TOOL_COVERAGE[tool]);
    expect(untested, "add these to tool-coverage.ts and write specs for them").toEqual([]);
  });

  it("does not claim coverage for tools that no longer exist", () => {
    const stale = Object.keys(TOOL_COVERAGE).filter((tool) => !registered.includes(tool));
    expect(stale, "these are listed in tool-coverage.ts but are not registered").toEqual([]);
  });

  it("points at spec files that exist", () => {
    const missing = [...new Set(Object.values(TOOL_COVERAGE))].filter(
      (spec) => !existsSync(join(e2eDir, spec)),
    );
    expect(missing).toEqual([]);
  });
});
