import { beforeEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  addTabToGroup,
  createTabGroup,
  deleteTabGroup,
  EMPTY_GROUP_GRACE_MS,
  getChromeTabId,
  getExtensionId,
  getGroupForTab,
  getTabGroup,
  getTabsInGroup,
  inheritGroupFromOpener,
  isValidColor,
  listTabGroups,
  pruneStaleTargets,
  removeTabFromGroup,
  setChromeGroupId,
  setExtensionId,
} from "../src/browser/tab-groups.js";

const dataDir = process.env.APMCP_DATA_DIR!;
const registryPath = join(dataDir, "tab-groups.json");
const lockPath = `${registryPath}.lock`;

beforeEach(() => {
  rmSync(registryPath, { force: true });
  rmSync(lockPath, { force: true });
});

describe("tab group registry", () => {
  it("creates and reuses groups by name", () => {
    const created = createTabGroup("http://localhost:9223", {
      name: "pr964-review",
      color: "green",
    });
    const reused = createTabGroup("http://localhost:9223", {
      name: "pr964-review",
      color: "red",
    });

    expect(created).toMatchObject({
      name: "pr964-review",
      color: "green",
      created: true,
    });
    expect(reused).toMatchObject({
      name: "pr964-review",
      color: "green",
      created: false,
    });
  });

  it("persists groups and tab membership to disk", () => {
    createTabGroup("http://localhost:9223", { name: "pricing", color: "blue" });
    addTabToGroup("http://localhost:9223", "target-1", "pricing", 42);

    expect(existsSync(registryPath)).toBe(true);

    const data = JSON.parse(readFileSync(registryPath, "utf-8"));
    expect(data.groups.pricing.color).toBe("blue");
    expect(data.tabs["target-1"]).toMatchObject({
      groupName: "pricing",
      chromeTabId: 42,
    });
  });

  it("lists groups with counts and metadata", () => {
    createTabGroup("http://localhost:9223", { name: "billing", color: "cyan" });
    addTabToGroup("http://localhost:9223", "target-1", "billing");
    addTabToGroup("http://localhost:9223", "target-2", "billing");
    setChromeGroupId("billing", 99);

    expect(listTabGroups("http://localhost:9223")).toEqual([
      expect.objectContaining({
        name: "billing",
        color: "cyan",
        chromeGroupId: 99,
        tabCount: 2,
      }),
    ]);
    expect(getTabGroup("http://localhost:9223", "billing")).toEqual(
      expect.objectContaining({
        name: "billing",
        color: "cyan",
        chromeGroupId: 99,
      }),
    );
  });

  it("tracks tabs bidirectionally and supports cleanup", () => {
    createTabGroup("http://localhost:9223", { name: "pricing" });
    addTabToGroup("http://localhost:9223", "target-1", "pricing");
    addTabToGroup("http://localhost:9223", "target-2", "pricing");

    expect(getTabsInGroup("http://localhost:9223", "pricing").sort()).toEqual([
      "target-1",
      "target-2",
    ]);
    expect(getGroupForTab("http://localhost:9223", "target-1")).toBe("pricing");

    removeTabFromGroup("http://localhost:9223", "target-1");
    expect(getGroupForTab("http://localhost:9223", "target-1")).toBeNull();

    const pruned = pruneStaleTargets("http://localhost:9223", ["target-2"]);
    expect(pruned).toBe(0);

    const removed = deleteTabGroup("http://localhost:9223", "pricing");
    expect(removed).toEqual({
      removed: true,
      ungroupedTargetIds: ["target-2"],
    });
  });

  it("removes a group when its last tab is removed", () => {
    const cdp = "http://localhost:9223";
    createTabGroup(cdp, { name: "temporary" });
    addTabToGroup(cdp, "target-1", "temporary");

    removeTabFromGroup(cdp, "target-1");

    expect(getTabGroup(cdp, "temporary")).toBeNull();
  });

  it("removes a group when pruning its last stale tab", () => {
    const cdp = "http://localhost:9223";
    createTabGroup(cdp, { name: "stale" });
    addTabToGroup(cdp, "target-1", "stale");

    expect(pruneStaleTargets(cdp, [])).toBe(1);
    expect(getTabGroup(cdp, "stale")).toBeNull();
  });

  it("keeps a new empty group during the create-tab grace period", () => {
    const cdp = "http://localhost:9223";
    createTabGroup(cdp, { name: "pending" });

    pruneStaleTargets(cdp, []);

    expect(getTabGroup(cdp, "pending")).not.toBeNull();
  });

  it("removes an unused group after the create-tab grace period", () => {
    const cdp = "http://localhost:9223";
    createTabGroup(cdp, { name: "abandoned" });
    const data = JSON.parse(readFileSync(registryPath, "utf-8"));
    data.groups.abandoned.createdAt = Date.now() - EMPTY_GROUP_GRACE_MS - 1;
    writeFileSync(registryPath, JSON.stringify(data), "utf-8");

    pruneStaleTargets(cdp, []);

    expect(getTabGroup(cdp, "abandoned")).toBeNull();
  });

  it("gives a tab the group its opener is in", () => {
    const cdp = "http://localhost:9223";
    createTabGroup(cdp, { name: "amazon" });
    addTabToGroup(cdp, "opener-1", "amazon");

    // A tab a page opens for itself is never registered by action:new, so
    // without this it stays ungrouped and a scoped list loses it.
    expect(inheritGroupFromOpener(cdp, "opener-1", "popup-1")).toBe("amazon");
    expect(getGroupForTab(cdp, "popup-1")).toBe("amazon");
    expect(getTabsInGroup(cdp, "amazon").sort()).toEqual(["opener-1", "popup-1"]);
  });

  it("leaves a popup ungrouped when its opener is ungrouped", () => {
    const cdp = "http://localhost:9223";
    createTabGroup(cdp, { name: "flipkart" });

    expect(inheritGroupFromOpener(cdp, "loose-tab", "popup-2")).toBeNull();
    expect(getGroupForTab(cdp, "popup-2")).toBeNull();
    expect(getTabsInGroup(cdp, "flipkart")).toEqual([]);
  });

  it("keeps one group's popup out of another group", () => {
    const cdp = "http://localhost:9223";
    createTabGroup(cdp, { name: "amazon" });
    createTabGroup(cdp, { name: "flipkart" });
    addTabToGroup(cdp, "amazon-tab", "amazon");
    addTabToGroup(cdp, "flipkart-tab", "flipkart");

    inheritGroupFromOpener(cdp, "amazon-tab", "amazon-popup");
    inheritGroupFromOpener(cdp, "flipkart-tab", "flipkart-popup");

    expect(getTabsInGroup(cdp, "amazon").sort()).toEqual(["amazon-popup", "amazon-tab"]);
    expect(getTabsInGroup(cdp, "flipkart").sort()).toEqual(["flipkart-popup", "flipkart-tab"]);
  });

  it("stores chrome and extension metadata", () => {
    createTabGroup("http://localhost:9223", { name: "metadata" });
    addTabToGroup("http://localhost:9223", "target-1", "metadata", 777);
    setExtensionId("ext-123");

    expect(getChromeTabId("http://localhost:9223", "target-1")).toBe(777);
    expect(getExtensionId()).toBe("ext-123");
  });
});

describe("color validation", () => {
  it("accepts only supported colors", () => {
    expect(isValidColor("blue")).toBe(true);
    expect(isValidColor("cyan")).toBe(true);
    expect(isValidColor("magenta")).toBe(false);
  });
});
