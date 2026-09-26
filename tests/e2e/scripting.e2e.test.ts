import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { refFor, startSession, type Session } from "./helpers/session.js";

/** browser_evaluate, browser_run_code_unsafe */
describe("scripting", () => {
  let session: Session;

  beforeAll(async () => {
    session = await startSession("scripting");
  });

  afterAll(async () => {
    await session?.dispose();
  });

  it("evaluates an expression in the page", async () => {
    const result = await session.evaluateJson<{ title: string; host: string }>(
      "() => ({ title: document.title, host: location.host })",
    );
    expect(result.title).toContain("Fixture");
    expect(result.host).toContain("127.0.0.1");
  });

  it("evaluates against a ref", async () => {
    const snapshot = await session.snapshot();
    const output = await session.callOk("browser_evaluate", {
      ref: refFor(snapshot, /"Click me"/),
      expression: "(el) => el.tagName",
    });
    expect(output).toContain("BUTTON");
  });

  it("runs Node-side Playwright code with the page handle", async () => {
    const output = await session.callOk("browser_run_code_unsafe", {
      code: "async (page) => ({ url: page.url(), title: await page.title() })",
    });
    expect(output).toContain("127.0.0.1");
  });

  it("reaches HTTP APIs through page.request, bypassing CORS", async () => {
    const output = await session.callOk("browser_run_code_unsafe", {
      code: `async (page) => {
        const response = await page.request.get(${JSON.stringify(`${session.baseUrl}/data.json`)});
        const body = await response.json();
        return { status: response.status(), items: body.items.length };
      }`,
    });
    expect(output).toContain('"status":200');
    expect(output).toContain('"items":3');
  });

  it("surfaces errors thrown by the supplied code", async () => {
    const result = await session.call("browser_run_code_unsafe", {
      code: "async () => { throw new Error('deliberate-failure'); }",
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("deliberate-failure");
  });
});
