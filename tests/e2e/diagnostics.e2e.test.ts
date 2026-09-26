import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startSession, type Session } from "./helpers/session.js";

/** browser_console_messages, browser_page_errors */
describe("console and page errors", () => {
  let session: Session;

  beforeAll(async () => {
    session = await startSession("diagnostics");
  });

  afterAll(async () => {
    await session?.dispose();
  });

  it("collects console output from page load", async () => {
    const output = await session.callOk("browser_console_messages");
    expect(output).toContain("fixture-console-log");
    expect(output).toContain("fixture-console-warn");
  });

  it("filters console output by level", async () => {
    const output = await session.callOk("browser_console_messages", { level: "error" });
    expect(output).toContain("fixture-console-error");
    expect(output).not.toContain("fixture-console-log");
  });

  it("captures uncaught page errors with a stack", async () => {
    await session.callOk("browser_click", { element: "#btn-error" });
    const output = await session.callOk("browser_page_errors");
    expect(output).toContain("fixture-page-error");
    expect(output).toContain("stack");
  });
});
