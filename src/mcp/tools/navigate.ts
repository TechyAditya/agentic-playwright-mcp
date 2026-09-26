/**
 * browser_navigate tool - navigate to URLs in specific tabs
 */

import type { ServerConfig } from "../../config.js";
import type { RegisterToolFn } from "../types.js";
import { navigateViaPlaywright } from "../../browser/pw-tools-snapshot.js";

export function registerBrowserNavigateTool(
  register: RegisterToolFn,
  config: ServerConfig
) {
  register(
    "browser_navigate",
    "Navigate tab to URL.",
    {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL to open.",
        },
        targetId: {
          type: "string",
          description: "Tab id from browser_tabs. Default first tab.",
        },
      },
      required: ["url"],
    },
    async (args: { url: string; targetId?: string }) => {
      if (!config.cdpEndpoint) {
        throw new Error("CDP endpoint not configured");
      }

      const result = await navigateViaPlaywright({
        cdpUrl: config.cdpEndpoint,
        targetId: args.targetId,
        url: args.url,
      });

      return `**Navigation successful**\\nURL: ${result.url}`;
    }
  );
}
