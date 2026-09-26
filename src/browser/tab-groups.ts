/**
 * Persistent logical tab-group registry.
 *
 * Tab isolation should continue to work even when the companion Chrome
 * extension is unavailable. This module stores group membership on disk so
 * separate MCP stdio processes (for example mcporter calls) can coordinate.
 * When the extension is available, callers can still use the stored
 * chromeTabId/chromeGroupId metadata for visual grouping.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

interface StoredTabGroup {
  color: string;
  createdAt: number;
  chromeGroupId?: number;
  hasOwnedTabs?: boolean;
}

interface StoredTabEntry {
  groupName: string;
  addedAt: number;
  chromeTabId?: number;
}

interface TabGroupRegistry {
  groups: Record<string, StoredTabGroup>;
  tabs: Record<string, StoredTabEntry>;
  extensionId?: string;
}

export interface TabGroup {
  name: string;
  color: string;
  createdAt: number;
  chromeGroupId: number | null;
  tabCount: number;
  tabs: Array<{ targetId: string; chromeTabId: number; addedAt: number }>;
}

export const VALID_COLORS = [
  "grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan",
] as const;

export type TabGroupColor = (typeof VALID_COLORS)[number];

export const EMPTY_GROUP_GRACE_MS = 60_000;

export function isValidColor(c: string): c is TabGroupColor {
  return (VALID_COLORS as readonly string[]).includes(c);
}

const DATA_DIR = process.env.APMCP_DATA_DIR || join(homedir(), ".agentic-playwright-mcp");
const REGISTRY_PATH = join(DATA_DIR, "tab-groups.json");
const LOCK_PATH = `${REGISTRY_PATH}.lock`;

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readRegistry(): TabGroupRegistry {
  ensureDir();
  if (!existsSync(REGISTRY_PATH)) {
    return { groups: {}, tabs: {} };
  }

  try {
    const raw = readFileSync(REGISTRY_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<TabGroupRegistry>;
    return {
      groups: parsed.groups ?? {},
      tabs: parsed.tabs ?? {},
      extensionId: parsed.extensionId,
    };
  } catch {
    return { groups: {}, tabs: {} };
  }
}

function writeRegistry(registry: TabGroupRegistry): void {
  ensureDir();
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), "utf-8");
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireLock(maxWaitMs = 3_000): void {
  const start = Date.now();
  while (true) {
    try {
      writeFileSync(LOCK_PATH, String(process.pid), { flag: "wx" });
      return;
    } catch {
      try {
        const pid = parseInt(readFileSync(LOCK_PATH, "utf-8"), 10);
        if (pid && !isProcessAlive(pid)) {
          unlinkSync(LOCK_PATH);
          continue;
        }
      } catch {
        // Another process may have released the lock.
      }

      if (Date.now() - start > maxWaitMs) {
        try {
          unlinkSync(LOCK_PATH);
        } catch {
          // Ignore stale lock removal failures.
        }
        continue;
      }

      const waitUntil = Date.now() + 25;
      while (Date.now() < waitUntil) {
        // Busy-wait keeps the registry helpers synchronous.
      }
    }
  }
}

function releaseLock(): void {
  try {
    unlinkSync(LOCK_PATH);
  } catch {
    // Ignore double release / race cleanup.
  }
}

function withRegistry<T>(fn: (registry: TabGroupRegistry) => T): T {
  acquireLock();
  try {
    const registry = readRegistry();
    const result = fn(registry);
    writeRegistry(registry);
    return result;
  } finally {
    releaseLock();
  }
}

function withReadOnlyRegistry<T>(fn: (registry: TabGroupRegistry) => T): T {
  acquireLock();
  try {
    return fn(readRegistry());
  } finally {
    releaseLock();
  }
}

function normalizeGroupName(name: string): string {
  return name.trim() || "unnamed";
}

function normalizeGroupColor(color?: string): string {
  return color && isValidColor(color) ? color : "blue";
}

function getStoredGroup(registry: TabGroupRegistry, name: string): StoredTabGroup | null {
  return registry.groups[name] ?? null;
}

function removeGroupIfEmpty(
  registry: TabGroupRegistry,
  name: string,
  now = Date.now(),
): boolean {
  const group = registry.groups[name];
  if (!group) {
    return false;
  }
  const hasTabs = Object.values(registry.tabs).some((entry) => entry.groupName === name);
  if (hasTabs) {
    return false;
  }
  const newUnusedGroup = group.hasOwnedTabs === false;
  if (newUnusedGroup && now - group.createdAt < EMPTY_GROUP_GRACE_MS) {
    return false;
  }
  delete registry.groups[name];
  return true;
}

function removeExpiredEmptyGroups(registry: TabGroupRegistry, now = Date.now()): void {
  for (const name of Object.keys(registry.groups)) {
    removeGroupIfEmpty(registry, name, now);
  }
}

function buildGroupView(name: string, group: StoredTabGroup, registry: TabGroupRegistry): TabGroup {
  const tabs = Object.entries(registry.tabs)
    .filter(([, entry]) => entry.groupName === name)
    .map(([targetId, entry]) => ({
      targetId,
      chromeTabId: entry.chromeTabId ?? -1,
      addedAt: entry.addedAt,
    }));

  return {
    name,
    color: group.color || "blue",
    createdAt: group.createdAt,
    chromeGroupId: group.chromeGroupId ?? null,
    tabCount: tabs.length,
    tabs,
  };
}

export function createTabGroup(
  _cdpUrl: string,
  opts: { name: string; color?: string },
): { name: string; color: string; createdAt: number; created: boolean } {
  const name = normalizeGroupName(opts.name);
  const color = normalizeGroupColor(opts.color);

  return withRegistry((registry) => {
    const existing = getStoredGroup(registry, name);
    if (existing) {
      return {
        name,
        color: existing.color || "blue",
        createdAt: existing.createdAt,
        created: false,
      };
    }

    const createdAt = Date.now();
    registry.groups[name] = { color, createdAt, hasOwnedTabs: false };
    return { name, color, createdAt, created: true };
  });
}

export function listTabGroups(_cdpUrl: string): TabGroup[] {
  return withReadOnlyRegistry((registry) =>
    Object.entries(registry.groups).map(([name, group]) => buildGroupView(name, group, registry)),
  );
}

export function deleteTabGroup(
  _cdpUrl: string,
  name: string,
): { removed: boolean; ungroupedTargetIds: string[] } {
  return withRegistry((registry) => {
    if (!registry.groups[name]) {
      return { removed: false, ungroupedTargetIds: [] };
    }

    const ungroupedTargetIds: string[] = [];
    for (const [targetId, entry] of Object.entries(registry.tabs)) {
      if (entry.groupName === name) {
        ungroupedTargetIds.push(targetId);
        delete registry.tabs[targetId];
      }
    }

    delete registry.groups[name];
    return { removed: true, ungroupedTargetIds };
  });
}

export function getTabGroup(
  _cdpUrl: string,
  name: string,
): { name: string; color: string; createdAt: number; chromeGroupId?: number } | null {
  return withReadOnlyRegistry((registry) => {
    const group = getStoredGroup(registry, name);
    if (!group) {
      return null;
    }

    return {
      name,
      color: group.color || "blue",
      createdAt: group.createdAt,
      chromeGroupId: group.chromeGroupId,
    };
  });
}

export function addTabToGroup(
  _cdpUrl: string,
  targetId: string,
  groupName: string,
  chromeTabId?: number,
): { chromeGroupId: number | null } {
  return withRegistry((registry) => {
    const group = getStoredGroup(registry, groupName);
    if (!group) {
      throw new Error(`Tab group not found: ${groupName}`);
    }

    const previousGroupName = registry.tabs[targetId]?.groupName;
    registry.tabs[targetId] = {
      groupName,
      addedAt: Date.now(),
      ...(chromeTabId !== undefined ? { chromeTabId } : {}),
    };
    group.hasOwnedTabs = true;

    if (previousGroupName && previousGroupName !== groupName) {
      removeGroupIfEmpty(registry, previousGroupName);
    }

    return { chromeGroupId: group.chromeGroupId ?? null };
  });
}

/**
 * Give a tab the group its opener is in.
 *
 * Only browser_tabs({ action: 'new' }) records membership, so a tab a page
 * opens for itself starts ungrouped. A group-scoped listing then loses it,
 * and two agents sharing this browser can each mistake it for their own.
 * Returns the group it joined, or null when the opener is ungrouped.
 */
export function inheritGroupFromOpener(
  cdpUrl: string,
  openerTargetId: string,
  targetId: string,
): string | null {
  const groupName = getGroupForTab(cdpUrl, openerTargetId);
  if (!groupName || targetId === openerTargetId) {
    return null;
  }
  addTabToGroup(cdpUrl, targetId, groupName);
  return groupName;
}

export function removeTabFromGroup(_cdpUrl: string, targetId: string): void {
  withRegistry((registry) => {
    const groupName = registry.tabs[targetId]?.groupName;
    delete registry.tabs[targetId];
    if (groupName) {
      removeGroupIfEmpty(registry, groupName);
    }
  });
}

export function getGroupForTab(_cdpUrl: string, targetId: string): string | null {
  return withReadOnlyRegistry((registry) => registry.tabs[targetId]?.groupName ?? null);
}

export function getTabsInGroup(_cdpUrl: string, groupName: string): string[] {
  return withReadOnlyRegistry((registry) =>
    Object.entries(registry.tabs)
      .filter(([, entry]) => entry.groupName === groupName)
      .map(([targetId]) => targetId),
  );
}

export function getChromeTabId(cdpUrlOrTargetId: string, maybeTargetId?: string): number | null {
  const targetId = maybeTargetId ?? cdpUrlOrTargetId;
  return withReadOnlyRegistry((registry) => registry.tabs[targetId]?.chromeTabId ?? null);
}

export function pruneStaleTargets(
  cdpUrlOrLiveTargetIds: string | string[] | Set<string>,
  maybeLiveTargetIds?: string[] | Set<string>,
): number {
  const live = maybeLiveTargetIds ?? cdpUrlOrLiveTargetIds;
  const liveTargetIds = live instanceof Set ? live : new Set(Array.isArray(live) ? live : []);

  return withRegistry((registry) => {
    let pruned = 0;
    const affectedGroups = new Set<string>();
    for (const targetId of Object.keys(registry.tabs)) {
      if (!liveTargetIds.has(targetId)) {
        affectedGroups.add(registry.tabs[targetId].groupName);
        delete registry.tabs[targetId];
        pruned += 1;
      }
    }
    for (const groupName of affectedGroups) {
      removeGroupIfEmpty(registry, groupName);
    }
    removeExpiredEmptyGroups(registry);
    return pruned;
  });
}

export function getExtensionId(): string | null {
  return withReadOnlyRegistry((registry) => registry.extensionId ?? null);
}

export function setExtensionId(extensionId: string): void {
  withRegistry((registry) => {
    registry.extensionId = extensionId;
  });
}

export function setChromeGroupId(groupName: string, chromeGroupId: number): void {
  withRegistry((registry) => {
    const group = registry.groups[groupName];
    if (group) {
      group.chromeGroupId = chromeGroupId;
    }
  });
}

export function generateGroupId(): string {
  return `g_${randomBytes(8).toString("hex")}`;
}
