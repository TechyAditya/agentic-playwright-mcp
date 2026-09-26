import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { refFor, startSession, type Session } from "./helpers/session.js";

/** browser_snapshot, browser_find */
describe("snapshot and find", () => {
  let session: Session;

  beforeAll(async () => {
    session = await startSession("snapshot");
  });

  afterAll(async () => {
    await session?.dispose();
  });

  it("returns a role snapshot with refs for roled elements", async () => {
    const snapshot = await session.snapshot();
    expect(snapshot).toContain('heading "Fixture Page"');
    expect(refFor(snapshot, /"Click me"/)).toMatch(/^e\d+$/);
  });

  it("finds text in the snapshot", async () => {
    const output = await session.callOk("browser_find", { text: "alpaca-sentinel" });
    expect(output).toContain("alpaca-sentinel");
  });

  it("finds by regex", async () => {
    const output = await session.callOk("browser_find", { regex: "/fixture page/i" });
    expect(output).toContain("Fixture Page");
  });

  it("reports no hits rather than failing", async () => {
    const result = await session.call("browser_find", { text: "no-such-text-anywhere" });
    expect(result.isError).toBe(false);
    expect(result.text).not.toMatch(/\[ref=e\d+\]/);
  });
});
