import { beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { join } from "node:path";

const dataDir = process.env.APMCP_DATA_DIR!;
const registryPath = join(dataDir, "tab-groups.json");
const lockPath = `${registryPath}.lock`;

beforeEach(() => {
  rmSync(registryPath, { force: true });
  rmSync(lockPath, { force: true });
  vi.resetModules();
  vi.clearAllMocks();
});

async function loadHandlers(options: {
  visualGroups?: Array<{ id: number; title: string; color: string; collapsed: boolean }>;
  visualTabs?: Array<{
    id: number;
    url: string;
    title: string;
    groupId: number;
    targetId?: string;
  }>;
} = {}) {
  const openTabs: Array<{ targetId: string; title: string; url: string; type: string }> = [];

  vi.doMock("../src/browser/pw-session.js", () => ({
    listPagesViaPlaywright: vi.fn(async () => openTabs),
    createPageViaPlaywright: vi.fn(async ({ url }: { url: string }) => {
      const next = {
        targetId: `target-${openTabs.length + 1}`,
        title: url,
        url,
        type: "page",
      };
      openTabs.push(next);
      return next;
    }),
    closePageByTargetIdViaPlaywright: vi.fn(async ({ targetId }: { targetId: string }) => {
      const index = openTabs.findIndex((tab) => tab.targetId === targetId);
      if (index >= 0) {
        openTabs.splice(index, 1);
      }
    }),
    focusPageByTargetIdViaPlaywright: vi.fn(async () => {}),
    // browser_tabs pins the new tab's Page to its targetId so later tools cannot
    // pick a different tab that happens to share the URL.
    getPageForTargetId: vi.fn(async () => ({}) as never),
  }));

  vi.doMock("../src/browser/chrome-tab-groups.js", () => ({
    isTabGrouperAvailable: vi.fn(async () => false),
    createTabViaExtension: vi.fn(),
    closeTabViaExtension: vi.fn(),
    groupTabsVisually: vi.fn(),
    ungroupTabsVisually: vi.fn(),
    mapTargetIdsToChromeTabIds: vi.fn(async () => new Map()),
    listVisualTabGroups: vi.fn(async () => options.visualGroups ?? []),
    listVisualTabs: vi.fn(async () => options.visualTabs ?? []),
  }));

  const { registerBrowserTabGroupTool } = await import("../src/mcp/tools/tab-group.js");
  const { registerBrowserTabsTool } = await import("../src/mcp/tools/tabs.js");

  const handlers = new Map<string, (args: Record<string, unknown>) => Promise<string>>();
  const register = (
    name: string,
    _description: string,
    _schema: unknown,
    handler: (args: Record<string, unknown>) => Promise<string>,
  ) => {
    handlers.set(name, handler);
  };

  const config = { cdpEndpoint: "http://localhost:9223" };
  registerBrowserTabGroupTool(register, config);
  registerBrowserTabsTool(register, config);

  return {
    openTabs,
    tabGroupHandler: handlers.get("browser_tab_group")!,
    tabsHandler: handlers.get("browser_tabs")!,
  };
}

describe("tool fallback without extension", () => {
  it("creates logical tab groups even when the companion extension is missing", async () => {
    const { tabGroupHandler } = await loadHandlers();

    const result = await tabGroupHandler({
      action: "create",
      name: "pr964-review",
      color: "blue",
    });

    expect(result).toContain("groupId: pr964-review");
    expect(result).toContain("Visual grouping: unavailable");
  });

  it("creates grouped tabs through the Playwright fallback path", async () => {
    const { tabGroupHandler, tabsHandler } = await loadHandlers();

    await tabGroupHandler({
      action: "create",
      name: "pricing-review",
      color: "green",
    });

    const created = await tabsHandler({
      action: "new",
      groupId: "pricing-review",
      url: "http://localhost:3331/pricing",
    });
    const listed = await tabsHandler({
      action: "list",
      groupId: "pricing-review",
    });

    expect(created).toContain("targetId: target-1");
    expect(created).toContain("Group: pricing-review");
    expect(listed).toContain("target-1");
    expect(listed).toContain("http://localhost:3331/pricing");
  });

  it("allows ungrouped tab creation for local manual testing", async () => {
    const { tabsHandler } = await loadHandlers();

    const created = await tabsHandler({
      action: "new",
      url: "http://localhost:3331",
    });
    const listed = await tabsHandler({
      action: "list",
    });

    expect(created).toContain("Group: ungrouped");
    expect(created).toContain("fallback for local manual testing");
    expect(listed).toContain("[ungrouped]");
    expect(listed).toContain("http://localhost:3331");
  });
});

describe("native Chrome tab groups", () => {
  const manualGroup = {
    id: 73,
    title: "manual-review",
    color: "blue",
    collapsed: false,
  };
  const manualTab = {
    id: 91,
    targetId: "target-manual",
    title: "Manual tab",
    url: "https://example.com/manual",
    groupId: manualGroup.id,
  };

  it("lists a group created by hand in Chrome", async () => {
    const { tabGroupHandler } = await loadHandlers({
      visualGroups: [manualGroup],
      visualTabs: [manualTab],
    });

    const listed = await tabGroupHandler({ action: "list" });

    expect(listed).toContain("1 Chrome tab group(s)");
    expect(listed).toContain("**manual-review**");
    expect(listed).toContain("Chrome group ID: 73");
    expect(listed).toContain("Tabs: 1");
  });

  it("labels a Playwright tab with its native Chrome group", async () => {
    const { openTabs, tabsHandler } = await loadHandlers({
      visualGroups: [manualGroup],
      visualTabs: [manualTab],
    });
    openTabs.push({
      targetId: manualTab.targetId,
      title: manualTab.title,
      url: manualTab.url,
      type: "page",
    });

    const listed = await tabsHandler({ action: "list" });

    expect(listed).toContain("target-manual");
    expect(listed).toContain("[Chrome group: manual-review]");
  });
});
