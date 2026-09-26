import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { refFor, startSession, type Session } from "./helpers/session.js";

/**
 * browser_click, browser_hover, browser_type, browser_press_key, browser_fill_form,
 * browser_select_option, browser_wait_for
 */
describe("interactions", () => {
  let session: Session;
  let snapshot: string;

  beforeAll(async () => {
    session = await startSession("interactions");
    snapshot = await session.snapshot();
  });

  afterAll(async () => {
    await session?.dispose();
  });

  it("clicks by ref", async () => {
    await session.callOk("browser_click", { ref: refFor(snapshot, /"Click me"/) });
    expect(await session.readText("#click-result")).toBe("click:done");
  });

  it("clicks by CSS selector", async () => {
    await session.callOk("browser_evaluate", {
      expression: "() => { document.querySelector('#click-result').textContent = 'click:none'; }",
    });
    await session.callOk("browser_click", { element: "#btn-click" });
    expect(await session.readText("#click-result")).toBe("click:done");
  });

  it("rejects ref and element together", async () => {
    const result = await session.call("browser_click", { ref: "e1", element: "#btn-click" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("mutually exclusive");
  });

  it("hovers a role-less element by CSS selector", async () => {
    await session.callOk("browser_hover", { element: "#hover-target" });
    expect(await session.readText("#hover-result")).toBe("hover:done");
  });

  it("types into a textbox", async () => {
    await session.callOk("browser_type", {
      ref: refFor(snapshot, /textbox "Text input"/),
      text: "typed-value",
    });
    const value = await session.evaluateJson<string>(
      "() => document.querySelector('#text-input').value",
    );
    expect(value).toBe("typed-value");
  });

  it("presses a key on the focused element", async () => {
    await session.callOk("browser_press_key", { key: "ArrowDown" });
    expect(await session.readText("#key-result")).toBe("key:ArrowDown");
  });

  it("fills several form fields at once", async () => {
    await session.callOk("browser_fill_form", {
      fields: [
        { ref: refFor(snapshot, /textbox "Name"/), type: "textbox", value: "Ada Lovelace" },
        { ref: refFor(snapshot, /textbox "Email"/), type: "textbox", value: "ada@example.com" },
      ],
    });
    const values = await session.evaluateJson<{ name: string; email: string }>(
      "() => ({ name: document.querySelector('#form-name').value, email: document.querySelector('#form-email').value })",
    );
    expect(values).toEqual({ name: "Ada Lovelace", email: "ada@example.com" });
  });

  it("selects an option", async () => {
    await session.callOk("browser_select_option", {
      ref: refFor(snapshot, /combobox/),
      values: ["cherry"],
    });
    expect(await session.readText("#select-result")).toBe("select:cherry");
  });

  it("waits for text that appears later", async () => {
    await session.callOk("browser_click", { element: "#btn-delayed" });
    const output = await session.callOk("browser_wait_for", { text: "delayed-text-appeared" });
    expect(output).toContain("Wait completed");
    expect(await session.readText("#delayed")).toBe("delayed-text-appeared");
  });

  it("waits for a fixed duration", async () => {
    const output = await session.callOk("browser_wait_for", { timeMs: 100 });
    expect(output).toContain("Wait completed");
  });

  it("explains a stale ref instead of clicking the wrong thing", async () => {
    const result = await session.call("browser_click", { ref: "e999" });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/Unknown ref|snapshot/i);
  });
});
