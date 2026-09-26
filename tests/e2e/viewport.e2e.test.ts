import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, statSync } from "node:fs";
import { startSession, type Session } from "./helpers/session.js";

/** browser_resize, browser_screenshot */
describe("viewport and screenshots", () => {
  let session: Session;

  beforeAll(async () => {
    session = await startSession("viewport");
  });

  afterAll(async () => {
    await session?.dispose();
  });

  it("resizes the viewport", async () => {
    await session.callOk("browser_resize", { width: 900, height: 650 });
    const size = await session.evaluateJson<{ w: number; h: number }>(
      "() => ({ w: window.innerWidth, h: window.innerHeight })",
    );
    expect(size).toEqual({ w: 900, h: 650 });
  });

  // Regression: the saved path was split on "/", so on Windows the directory came
  // out empty and every screenshot failed with ENOENT on mkdir "".
  it("saves a screenshot to a real file", async () => {
    const output = await session.callOk("browser_screenshot");
    const path = /Screenshot saved:\s*(.+?)\s*\(/.exec(output)?.[1];
    expect(path, output).toBeTruthy();
    expect(existsSync(path!)).toBe(true);
    expect(statSync(path!).size).toBeGreaterThan(0);
  });

  it("saves a scaled full-page jpeg", async () => {
    const output = await session.callOk("browser_screenshot", {
      fullPage: true,
      type: "jpeg",
      quality: 60,
      maxWidth: 800,
    });
    expect(output).toContain("image/jpeg");
    const path = /Screenshot saved:\s*(.+?)\s*\(/.exec(output)?.[1];
    expect(existsSync(path!)).toBe(true);
  });

  it("screenshots a single element", async () => {
    const output = await session.callOk("browser_screenshot", { element: "#intro" });
    const path = /Screenshot saved:\s*(.+?)\s*\(/.exec(output)?.[1];
    expect(existsSync(path!)).toBe(true);
  });

  it("rejects fullPage for an element screenshot", async () => {
    const result = await session.call("browser_screenshot", {
      element: "#intro",
      fullPage: true,
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("fullPage is not supported");
  });
});
