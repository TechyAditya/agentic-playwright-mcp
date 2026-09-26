/**
 * browser_tabs tool - manage browser tabs with targetId-based isolation and
 * logical tab-group support.
 */

import type { ServerConfig } from "../../config.js";
import type { RegisterToolFn } from "../types.js";
import {
  listPagesViaPlaywright,
  createPageViaPlaywright,
  closePageByTargetIdViaPlaywright,
  focusPageByTargetIdViaPlaywright,
  getPageForTargetId,
} from "../../browser/pw-session.js";
import {
  addTabToGroup,
  removeTabFromGroup,
  getTabsInGroup,
  getGroupForTab,
  getTabGroup,
  pruneStaleTargets,
  setChromeGroupId,
  getChromeTabId,
} from "../../browser/tab-groups.js";
import {
  groupTabsVisually,
  isTabGrouperAvailable,
  createTabViaExtension,
  closeTabViaExtension,
} from "../../browser/chrome-tab-groups.js";

export function registerBrowserTabsTool(
  register: RegisterToolFn,
  config: ServerConfig,
) {
  register(
    "browser_tabs",
    "Manage tabs. Actions: list, new, close, select.\n" +
      "list: with groupId, only that group's tabs. Without groupId, all tabs.\n" +
      "new: creates tab and returns its targetId. Keep that id for every later call.\n" +
      "close, select: pass targetId or index.\n" +
      "When more than one agent shares this browser, create a group with browser_tab_group " +
      "first and pass groupId. Ungrouped tabs still work for one agent.",
    {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "new", "close", "select"],
          description: "Action to perform.",
        },
        groupId: {
          type: "string",
          description: "Group name from browser_tab_group. Scopes this call to that group.",
        },
        url: {
          type: "string",
          description: "URL for action new. Default about:blank.",
        },
        index: {
          type: "number",
          description:
            "Tab index for close or select. Relative to the group when groupId is set.",
        },
        targetId: {
          type: "string",
          description: "Tab id for close or select, instead of index.",
        },
      },
      required: ["action"],
    },
    async (args: {
      action: string;
      groupId?: string;
      url?: string;
      index?: number;
      targetId?: string;
    }) => {
      if (!config.cdpEndpoint) {
        throw new Error("CDP endpoint not configured");
      }

      const { action, groupId, url, index, targetId } = args;
      const cdp = config.cdpEndpoint;

      async function getScopedTabs() {
        const allTabs = await listPagesViaPlaywright({ cdpUrl: cdp });
        pruneStaleTargets(cdp, allTabs.map((tab) => tab.targetId));

        if (!groupId) {
          return allTabs;
        }

        const group = getTabGroup(cdp, groupId);
        if (!group) {
          throw new Error(
            `Tab group not found: ${groupId}. Create one first with browser_tab_group.`,
          );
        }

        const groupTargetIds = new Set(getTabsInGroup(cdp, groupId));
        return allTabs.filter((tab) => groupTargetIds.has(tab.targetId));
      }

      async function resolveTarget(
        scopedTabs: Array<{ targetId: string; title: string; url: string }>,
      ): Promise<string> {
        if (targetId) {
          if (groupId) {
            const tabGroup = getGroupForTab(cdp, targetId);
            if (tabGroup !== groupId) {
              throw new Error(`Tab ${targetId} does not belong to group ${groupId}.`);
            }
          }
          return targetId;
        }

        if (typeof index === "number") {
          const tab = scopedTabs[index];
          if (!tab) {
            throw new Error(
              `No tab at index ${index}` + (groupId ? ` in group ${groupId}` : ""),
            );
          }
          return tab.targetId;
        }

        throw new Error("Either 'index' or 'targetId' is required");
      }

      switch (action) {
        case "list": {
          const tabs = await getScopedTabs();
          if (tabs.length === 0) {
            if (groupId) {
              return `**No tabs in group ${groupId}.**\nCreate one with browser_tabs({ action: 'new', groupId: '${groupId}', url: '...' })`;
            }
            return "**No tabs open.**";
          }

          const output = tabs
            .map((tab, tabIndex) => {
              const groupLabel = !groupId
                ? (() => {
                    const tabGroup = getGroupForTab(cdp, tab.targetId);
                    return tabGroup ? ` [${tabGroup}]` : " [ungrouped]";
                  })()
                : "";

              return (
                `[${tabIndex}] **targetId: ${tab.targetId}**${groupLabel}\n` +
                `    ${tab.title || "(no title)"}\n` +
                `    ${tab.url}`
              );
            })
            .join("\n\n");

          const label = groupId ? `in group ${groupId}` : "total";
          return `**${tabs.length} tab(s)** ${label}\n\n${output}`;
        }

        case "new": {
          if (groupId && !getTabGroup(cdp, groupId)) {
            throw new Error(
              `Tab group not found: ${groupId}. Create one first with browser_tab_group.`,
            );
          }

          const tabUrl = url || "about:blank";
          let resultTargetId: string;
          let chromeTabId: number | undefined;

          const hasExtension = await isTabGrouperAvailable(cdp);
          if (hasExtension) {
            try {
              const extTab = await createTabViaExtension(cdp, tabUrl);
              resultTargetId = extTab.targetId;
              chromeTabId = extTab.chromeTabId;
            } catch {
              const pwTab = await createPageViaPlaywright({ cdpUrl: cdp, url: tabUrl });
              resultTargetId = pwTab.targetId;
            }
          } else {
            const pwTab = await createPageViaPlaywright({ cdpUrl: cdp, url: tabUrl });
            resultTargetId = pwTab.targetId;
          }

          // Pin this Playwright Page to the targetId so later tools (goBack,
          // evaluate, …) do not pick a different tab with the same URL.
          await getPageForTargetId({ cdpUrl: cdp, targetId: resultTargetId }).catch(() => {});

          if (groupId) {
            addTabToGroup(cdp, resultTargetId, groupId, chromeTabId);

            if (chromeTabId !== undefined) {
              const group = getTabGroup(cdp, groupId);
              if (group) {
                try {
                  const visual = await groupTabsVisually(
                    cdp,
                    [chromeTabId],
                    group.name,
                    group.color,
                    group.chromeGroupId,
                  );
                  if (!group.chromeGroupId) {
                    setChromeGroupId(groupId, visual.groupId);
                  }
                } catch {
                  // Visual grouping is best-effort only.
                }
              }
            }
          }

          const groupLabel = groupId ?? "ungrouped";
          const note = groupId
            ? ""
            : "\nNote: created without a tab group. This is intended as a fallback for local manual testing.";

          return (
            `**Tab created**\n` +
            `**targetId: ${resultTargetId}** ← Use this with other browser tools\n` +
            `Group: ${groupLabel}\n` +
            `URL: ${tabUrl}` +
            note
          );
        }

        case "close": {
          const tabs = await getScopedTabs();
          const resolvedTargetId = await resolveTarget(tabs);
          const storedChromeTabId = getChromeTabId(cdp, resolvedTargetId);

          if (storedChromeTabId !== null) {
            try {
              await closeTabViaExtension(cdp, storedChromeTabId);
            } catch {
              await closePageByTargetIdViaPlaywright({
                cdpUrl: cdp,
                targetId: resolvedTargetId,
              });
            }
          } else {
            await closePageByTargetIdViaPlaywright({
              cdpUrl: cdp,
              targetId: resolvedTargetId,
            });
          }

          removeTabFromGroup(cdp, resolvedTargetId);
          return `**Tab closed:** ${resolvedTargetId}`;
        }

        case "select": {
          const tabs = await getScopedTabs();
          const resolvedTargetId = await resolveTarget(tabs);

          await focusPageByTargetIdViaPlaywright({
            cdpUrl: cdp,
            targetId: resolvedTargetId,
          });

          return `**Tab focused:** ${resolvedTargetId}`;
        }

        default:
          throw new Error(`Unknown action: ${action}`);
      }
    },
  );
}
