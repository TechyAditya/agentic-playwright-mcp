/**
 * Page activity tools - console messages, network requests, response bodies,
 * and uncaught page errors.
 *
 * The underlying collectors already existed in src/browser/pw-tools-activity.ts
 * and pw-tools-responses.ts; these registrations expose them over MCP, scoped
 * to a targetId like the rest of the server's tools.
 */

import type { ServerConfig } from "../../config.js";
import type { RegisterToolFn } from "../types.js";
import {
  getConsoleMessagesViaPlaywright,
  getNetworkRequestDetailsViaPlaywright,
  getNetworkRequestsViaPlaywright,
  getPageErrorsViaPlaywright,
} from "../../browser/pw-tools-activity.js";
import { responseBodyViaPlaywright } from "../../browser/pw-tools-responses.js";

export function registerBrowserActivityTools(
  register: RegisterToolFn,
  config: ServerConfig
) {
  // browser_console_messages
  register(
    "browser_console_messages",
    "Console messages from page. Filter by minimum level.",
    {
      type: "object",
      properties: {
        level: {
          type: "string",
          enum: ["verbose", "info", "warning", "error"],
          description: "Return only this level or above.",
        },
        targetId: {
          type: "string",
          description: "Tab id. Default first tab.",
        },
      },
    },
    async (args: { level?: string; targetId?: string }) => {
      if (!config.cdpEndpoint) throw new Error("CDP endpoint not configured");

      const messages = await getConsoleMessagesViaPlaywright({
        cdpUrl: config.cdpEndpoint,
        targetId: args.targetId,
        level: args.level,
      });

      if (!messages.length) return "**No console messages**";
      return messages;
    }
  );

  // browser_network_requests
  register(
    "browser_network_requests",
    "List network requests this tab made, numbered from 1. Pass that index to " +
      "browser_network_request for headers and body.",
    {
      type: "object",
      properties: {
        filter: {
          type: "string",
          description: "Return only URLs containing this substring.",
        },
        clear: {
          type: "boolean",
          description: "Clear collected requests after returning.",
        },
        targetId: {
          type: "string",
          description: "Tab id. Default first tab.",
        },
      },
    },
    async (args: { filter?: string; clear?: boolean; targetId?: string }) => {
      if (!config.cdpEndpoint) throw new Error("CDP endpoint not configured");

      const { requests } = await getNetworkRequestsViaPlaywright({
        cdpUrl: config.cdpEndpoint,
        targetId: args.targetId,
        filter: args.filter,
        clear: args.clear,
      });

      if (!requests.length) return "**No network requests**";
      return requests.map((req, i) => ({
        index: i + 1,
        ...req,
      }));
    }
  );

  // browser_network_request
  register(
    "browser_network_request",
    "Headers and body for one network request, by index from browser_network_requests.",
    {
      type: "object",
      properties: {
        index: {
          type: "integer",
          minimum: 1,
          description: "Index from browser_network_requests. Starts at 1.",
        },
        part: {
          type: "string",
          enum: [
            "request-headers",
            "request-body",
            "response-headers",
            "response-body",
          ],
          description: "Return only this part. Omit for all.",
        },
        filter: {
          type: "string",
          description: "Pass the same filter you used when listing, so indexes match.",
        },
        maxChars: {
          type: "number",
          description: "Truncate body to this many characters. Default 200000.",
        },
        targetId: {
          type: "string",
          description: "Tab id. Default first tab.",
        },
      },
      required: ["index"],
    },
    async (args: {
      index: number;
      part?: "request-headers" | "request-body" | "response-headers" | "response-body";
      filter?: string;
      maxChars?: number;
      targetId?: string;
    }) => {
      if (!config.cdpEndpoint) throw new Error("CDP endpoint not configured");

      return await getNetworkRequestDetailsViaPlaywright({
        cdpUrl: config.cdpEndpoint,
        targetId: args.targetId,
        index: args.index,
        part: args.part,
        filter: args.filter,
        maxChars: args.maxChars,
      });
    }
  );

  // browser_network_response_body
  register(
    "browser_network_response_body",
    "Response body for URL matching pattern. Checks traffic this tab already made, then waits " +
      "timeoutMs for new match. Chrome drops cached bodies after a while, and then this tool " +
      "says so instead of returning empty body. Re-fetch with browser_run_code_unsafe and " +
      "page.request.",
    {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Full URL, or substring to match. Full URL is safer.",
        },
        maxChars: {
          type: "number",
          description: "Truncate body to this many characters. Default 200000.",
        },
        timeoutMs: {
          type: "number",
          description: "Wait this long for new match. Default 20000.",
        },
        targetId: {
          type: "string",
          description: "Tab id. Default first tab.",
        },
      },
      required: ["url"],
    },
    async (args: {
      url: string;
      maxChars?: number;
      timeoutMs?: number;
      targetId?: string;
    }) => {
      if (!config.cdpEndpoint) throw new Error("CDP endpoint not configured");

      return await responseBodyViaPlaywright({
        cdpUrl: config.cdpEndpoint,
        targetId: args.targetId,
        url: args.url,
        maxChars: args.maxChars,
        timeoutMs: args.timeoutMs,
      });
    }
  );

  // browser_page_errors
  register(
    "browser_page_errors",
    "Uncaught JS errors from page.",
    {
      type: "object",
      properties: {
        clear: {
          type: "boolean",
          description: "Clear collected errors after returning.",
        },
        targetId: {
          type: "string",
          description: "Tab id. Default first tab.",
        },
      },
    },
    async (args: { clear?: boolean; targetId?: string }) => {
      if (!config.cdpEndpoint) throw new Error("CDP endpoint not configured");

      const { errors } = await getPageErrorsViaPlaywright({
        cdpUrl: config.cdpEndpoint,
        targetId: args.targetId,
        clear: args.clear,
      });

      if (!errors.length) return "**No page errors**";
      return errors;
    }
  );
}
