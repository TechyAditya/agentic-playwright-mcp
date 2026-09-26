import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startSession, type Session } from "./helpers/session.js";

/** browser_network_requests, browser_network_request, browser_network_response_body */
describe("network inspection", () => {
  let session: Session;

  beforeAll(async () => {
    session = await startSession("network");
  });

  afterAll(async () => {
    await session?.dispose();
  });

  it("lists the tab's requests with 1-based indexes", async () => {
    const output = await session.callOk("browser_network_requests");
    expect(output).toMatch(/"index":\s*1/);
    expect(output).toContain(session.baseUrl);
  });

  it("filters requests by URL substring", async () => {
    const output = await session.callOk("browser_network_requests", { filter: "data.json" });
    expect(output).toContain("data.json");
    expect(output).not.toContain('"resourceType": "document"');
  });

  it("returns headers for one request by index", async () => {
    const output = await session.callOk("browser_network_request", {
      index: 1,
      part: "response-headers",
    });
    expect(output.toLowerCase()).toContain("content-type");
  });

  it("rejects an index that was never listed", async () => {
    const result = await session.call("browser_network_request", { index: 9999 });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("No request at index");
  });

  it("reads a body from traffic the tab already made", async () => {
    // Chrome evicts bodies from its cache, so read one that was just fetched.
    await session.callOk("browser_evaluate", {
      expression: "() => fetch('/data.json').then((r) => r.text())",
    });
    const output = await session.callOk("browser_network_response_body", {
      url: "data.json",
      maxChars: 500,
    });
    expect(output).toContain('ok\\":true');
  });

  it("says a body was never requested rather than hanging on it", async () => {
    const result = await session.call("browser_network_response_body", {
      url: "/never-requested.json",
      timeoutMs: 1500,
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Response not found");
    expect(result.text).toContain("browser_network_requests");
  });
});
