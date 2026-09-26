import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startSession, type Session } from "./helpers/session.js";
import { SECOND_PAGE_MARKER } from "./helpers/fixture-server.js";

/** browser_navigate, browser_navigate_back */
describe("navigation", () => {
  let session: Session;

  beforeAll(async () => {
    session = await startSession("navigation");
  });

  afterAll(async () => {
    await session?.dispose();
  });

  it("navigates to a new url", async () => {
    const output = await session.callOk("browser_navigate", {
      url: `${session.baseUrl}/second.html`,
    });
    expect(output).toContain("/second.html");
    expect(await session.snapshot()).toContain(SECOND_PAGE_MARKER);
  });

  // Regression: this used page.evaluate(history.back), which died with
  // "Execution context was destroyed", and later reported failure on success
  // because Chromium restores from bfcache and goBack() returns null.
  it("goes back in history", async () => {
    const output = await session.callOk("browser_navigate_back");
    expect(output).toContain("Navigated back");
    expect(output).not.toContain("/second.html");
  });

  it("goes forward in history", async () => {
    const output = await session.callOk("browser_navigate_back", { forward: true });
    expect(output).toContain("Navigated forward");
    expect(output).toContain("/second.html");
  });

  it("reports when there is no forward entry", async () => {
    const result = await session.call("browser_navigate_back", { forward: true });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("No forward history entry");
  });
});
