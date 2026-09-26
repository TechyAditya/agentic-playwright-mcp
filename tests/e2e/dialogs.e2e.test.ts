import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startSession, type Session } from "./helpers/session.js";

/** browser_handle_dialog */
describe("javascript dialogs", () => {
  let session: Session;

  beforeAll(async () => {
    session = await startSession("dialogs");
  });

  afterAll(async () => {
    await session?.dispose();
  });

  it("accepts a confirm when armed before the click", async () => {
    const armed = await session.callOk("browser_handle_dialog", { accept: true });
    expect(armed).toContain("Armed");

    await session.callOk("browser_click", { element: "#btn-dialog" });
    expect(await session.readText("#dialog-result")).toBe("dialog:true");
  });

  it("dismisses a confirm when armed with accept false", async () => {
    await session.callOk("browser_handle_dialog", { accept: false });
    await session.callOk("browser_click", { element: "#btn-dialog" });
    expect(await session.readText("#dialog-result")).toBe("dialog:false");
  });

  // Regression: keeping a dialog listener registered stops Playwright's
  // auto-dismiss, and an unanswered dialog blocks everything. Before the
  // auto-dismiss safeguard, one alert() wedged the entire shared Chrome.
  it("does not wedge the tab when a dialog is never answered", async () => {
    await session.callOk("browser_click", { element: "#btn-alert" });
    expect(await session.readText("#dialog-result")).toBe("dialog:past-alert");

    const snapshot = await session.snapshot();
    expect(snapshot).toContain("Fixture Page");
  });

  it("reports the dialog it had to auto-dismiss", async () => {
    const output = await session.callOk("browser_handle_dialog", { accept: true });
    expect(output).toContain("auto-dismissed");
    expect(output).toContain("unarmed alert");
  });
});
