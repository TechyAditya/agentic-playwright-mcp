import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { startSession, type Session } from "./helpers/session.js";

/** browser_checkpoint, browser_checkpoint_report */
describe("checkpoints", () => {
  let session: Session;

  beforeAll(async () => {
    session = await startSession("checkpoints");
  });

  afterAll(async () => {
    await session?.dispose();
  });

  // Regression: playwright-checkpoint resolved @playwright/test from process.cwd(),
  // so this failed with "Cannot find module" whenever the server was started from
  // outside the package — which is how every MCP client starts it.
  it("captures a checkpoint from a server started outside the package", async () => {
    const output = await session.callOk("browser_checkpoint", {
      name: "e2e-checkpoint",
      description: "captured by the e2e suite",
    });
    expect(output).toContain("Checkpoint captured");
    expect(output).toContain(session.targetId);

    const runDir = /Run dir:\s*(.+)/.exec(output)?.[1]?.trim();
    expect(runDir, output).toBeTruthy();
    expect(existsSync(runDir!)).toBe(true);
  });

  it("generates a report over captured checkpoints", async () => {
    const output = await session.callOk("browser_checkpoint_report", { format: "markdown" });
    expect(output).toContain("Output dir:");

    const outputDir = /Output dir:\s*(.+)/.exec(output)?.[1]?.trim();
    expect(existsSync(outputDir!)).toBe(true);
  });
});
