import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startSession, type Session } from "./helpers/session.js";

/** browser_tab_group, browser_tabs, browser_close */
describe("tab groups and tabs", () => {
  let session: Session;

  beforeAll(async () => {
    session = await startSession("tabs");
  });

  afterAll(async () => {
    await session?.dispose();
  });

  it("lists the session tab inside its own group", async () => {
    const output = await session.client.callOk("browser_tabs", {
      action: "list",
      groupId: session.group,
    });
    expect(output).toContain(session.targetId);
  });

  it("selects a tab by targetId without raising the window", async () => {
    const output = await session.callOk("browser_tabs", { action: "select" });
    expect(output).toContain(session.targetId);
  });

  it("keeps a second group's tabs out of this group's listing", async () => {
    const otherGroup = `${session.group}-other`;
    await session.client.callOk("browser_tab_group", { action: "create", name: otherGroup });
    const created = await session.client.callOk("browser_tabs", {
      action: "new",
      groupId: otherGroup,
      url: `${session.baseUrl}/second.html`,
    });
    const otherTargetId = /[A-F0-9]{32}/.exec(created)?.[0];
    expect(otherTargetId).toBeTruthy();

    const ourTabs = await session.client.callOk("browser_tabs", {
      action: "list",
      groupId: session.group,
    });
    expect(ourTabs).not.toContain(otherTargetId);

    const theirTabs = await session.client.callOk("browser_tabs", {
      action: "list",
      groupId: otherGroup,
    });
    expect(theirTabs).toContain(otherTargetId);
    expect(theirTabs).not.toContain(session.targetId);

    await session.client.callOk("browser_tab_group", {
      action: "delete",
      groupId: otherGroup,
      closeTabs: true,
    });
  });

  it("keeps a tab the page opened inside the opener's group", async () => {
    const before = await session.client.callOk("browser_tabs", {
      action: "list",
      groupId: session.group,
    });

    // A popup is never registered by action:new, so without inheritance it
    // stays ungrouped and another agent's listing can claim it.
    await session.callOk("browser_evaluate", {
      expression:
        `() => { const a = document.createElement("a"); a.id = "popup-link"; ` +
        `a.href = "${session.baseUrl}/second.html"; a.target = "_blank"; ` +
        `a.textContent = "open"; document.body.appendChild(a); }`,
    });
    await session.callOk("browser_click", { element: "#popup-link" });

    let popupId: string | undefined;
    for (let attempt = 0; attempt < 10 && !popupId; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const listing = await session.client.callOk("browser_tabs", {
        action: "list",
        groupId: session.group,
      });
      popupId = [...listing.matchAll(/[A-F0-9]{32}/g)]
        .map((match) => match[0])
        .find((id) => !before.includes(id));
    }

    expect(popupId).toBeTruthy();
    await session.client.callOk("browser_close", { targetId: popupId });
  });

  it("closes a tab it opened", async () => {
    const created = await session.client.callOk("browser_tabs", {
      action: "new",
      groupId: session.group,
      url: `${session.baseUrl}/second.html`,
    });
    const throwaway = /[A-F0-9]{32}/.exec(created)?.[0];

    const closed = await session.client.callOk("browser_close", { targetId: throwaway });
    expect(closed).toContain("Closed");

    const remaining = await session.client.callOk("browser_tabs", {
      action: "list",
      groupId: session.group,
    });
    expect(remaining).not.toContain(throwaway);
  });

  it("removes a group after its last tab closes", async () => {
    const emptyGroup = `${session.group}-auto-cleanup`;
    await session.client.callOk("browser_tab_group", { action: "create", name: emptyGroup });
    const firstCreated = await session.client.callOk("browser_tabs", {
      action: "new",
      groupId: emptyGroup,
      url: `${session.baseUrl}/second.html`,
    });
    const secondCreated = await session.client.callOk("browser_tabs", {
      action: "new",
      groupId: emptyGroup,
      url: `${session.baseUrl}/second.html?tab=2`,
    });
    const firstTargetId = /[A-F0-9]{32}/.exec(firstCreated)?.[0];
    const secondTargetId = /[A-F0-9]{32}/.exec(secondCreated)?.[0];
    expect(firstTargetId).toBeTruthy();
    expect(secondTargetId).toBeTruthy();

    await session.client.callOk("browser_tabs", {
      action: "close",
      groupId: emptyGroup,
      targetId: firstTargetId,
    });
    const afterFirstClose = await session.client.callOk("browser_tab_group", {
      action: "list",
    });
    expect(afterFirstClose).toContain(emptyGroup);

    const remaining = await session.client.callOk("browser_tabs", {
      action: "list",
      groupId: emptyGroup,
    });
    expect(remaining).not.toContain(firstTargetId);
    expect(remaining).toContain(secondTargetId);

    await session.client.callOk("browser_close", { targetId: secondTargetId });
    const afterSecondClose = await session.client.callOk("browser_tab_group", {
      action: "list",
    });

    expect(afterSecondClose).not.toContain(emptyGroup);
  });

  it("lists groups", async () => {
    const output = await session.client.callOk("browser_tab_group", { action: "list" });
    expect(output).toContain(session.group);
  });
});
