/**
 * browser_snapshot tool - capture accessibility tree snapshot with element refs
 */

import type { ServerConfig } from "../../config.js";
import type { RegisterToolFn } from "../types.js";
import { snapshotRoleViaPlaywright } from "../../browser/pw-tools-snapshot.js";

export function registerBrowserSnapshotTool(
  register: RegisterToolFn,
  config: ServerConfig
) {
  register(
    "browser_snapshot",
    "Accessibility tree of the page, with refs (e1, e2) for click, type, hover. " +
      "Only elements with an accessible role get a ref. For role-less div or span, pass a CSS " +
      "selector in element instead. Refs die after navigation or DOM change, so snapshot again.",
    {
      type: "object",
      properties: {
        targetId: {
          type: "string",
          description: "Tab id from browser_tabs. Default first tab.",
        },
        maxChars: {
          type: "number",
          description: "Truncate snapshot at this many characters. Try 5000 to 15000.",
        },
        compact: {
          type: "boolean",
          description: "Drop unnamed structural elements and empty branches.",
        },
        interactive: {
          type: "boolean",
          description: "Keep only interactive elements: button, link, input. Smallest output.",
        },
        maxDepth: {
          type: "number",
          description: "Max tree depth. 0 is root only. Try 3 to 5 on complex pages.",
        },
      },
    },
    async (args: {
      targetId?: string;
      maxChars?: number;
      compact?: boolean;
      interactive?: boolean;
      maxDepth?: number;
    }) => {
      if (!config.cdpEndpoint) {
        throw new Error("CDP endpoint not configured");
      }

      const result = await snapshotRoleViaPlaywright({
        cdpUrl: config.cdpEndpoint,
        targetId: args.targetId,
        options: {
          compact: args.compact,
          interactive: args.interactive,
          maxDepth: args.maxDepth,
        },
      });

      let snapshot = result.snapshot;
      const stats = result.stats;

      // Apply maxChars truncation
      if (
        typeof args.maxChars === "number" &&
        args.maxChars > 0 &&
        snapshot.length > args.maxChars
      ) {
        snapshot =
          snapshot.slice(0, args.maxChars) +
          `\n\n[...TRUNCATED at ${args.maxChars} chars. ` +
          `Full snapshot: ${stats.chars} chars, ${stats.refs} refs, ` +
          `${stats.interactive} interactive elements]`;
      }

      // Always prepend stats header for model awareness
      const statsHeader = `[Snapshot: ${stats.chars} chars, ${stats.refs} refs, ${stats.interactive} interactive]`;

      return statsHeader + "\n" + snapshot;
    }
  );
}
