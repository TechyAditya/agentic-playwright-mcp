/**
 * Remaining interaction and page tools whose implementations already existed in
 * src/browser/ but were never registered over MCP: select_option, file_upload,
 * drag, resize, close, navigate_back/forward.
 */

import type { ServerConfig } from "../../config.js";
import type { RegisterToolFn } from "../types.js";
import {
  dragViaPlaywright,
  dropViaPlaywright,
  selectOptionViaPlaywright,
  setInputFilesViaPlaywright,
} from "../../browser/pw-tools-interactions.js";
import {
  closePageViaPlaywright,
  findInSnapshotViaPlaywright,
  navigateHistoryViaPlaywright,
  resizeViewportViaPlaywright,
} from "../../browser/pw-tools-snapshot.js";
import { handleDialogViaPlaywright } from "../../browser/pw-tools-downloads.js";

export function registerBrowserPageTools(
  register: RegisterToolFn,
  config: ServerConfig
) {
  // browser_select_option
  register(
    "browser_select_option",
    "Select options in a <select> dropdown.",
    {
      type: "object",
      properties: {
        ref: {
          type: "string",
          description: "Snapshot ref, such as e1.",
        },
        values: {
          type: "array",
          items: { type: "string" },
          description: "Option values to select.",
        },
        targetId: {
          type: "string",
          description: "Tab id. Default first tab.",
        },
      },
      required: ["ref", "values"],
    },
    async (args: { ref: string; values: string[]; targetId?: string }) => {
      if (!config.cdpEndpoint) throw new Error("CDP endpoint not configured");

      await selectOptionViaPlaywright({
        cdpUrl: config.cdpEndpoint,
        targetId: args.targetId,
        ref: args.ref,
        values: args.values,
      });

      return `**Selected** ${args.values.join(", ")} in ${args.ref}`;
    }
  );

  // browser_file_upload
  register(
    "browser_file_upload",
    "Set files on file input. Pass inputRef or element, not both.",
    {
      type: "object",
      properties: {
        paths: {
          type: "array",
          items: { type: "string" },
          description: "Absolute file paths.",
        },
        inputRef: {
          type: "string",
          description: "Snapshot ref of the file input.",
        },
        element: {
          type: "string",
          description: "CSS selector of the file input, instead of inputRef.",
        },
        targetId: {
          type: "string",
          description: "Tab id. Default first tab.",
        },
      },
      required: ["paths"],
    },
    async (args: {
      paths: string[];
      inputRef?: string;
      element?: string;
      targetId?: string;
    }) => {
      if (!config.cdpEndpoint) throw new Error("CDP endpoint not configured");

      await setInputFilesViaPlaywright({
        cdpUrl: config.cdpEndpoint,
        targetId: args.targetId,
        inputRef: args.inputRef,
        element: args.element,
        paths: args.paths,
      });

      return `**Uploaded** ${args.paths.length} file(s)`;
    }
  );

  // browser_drag
  register(
    "browser_drag",
    "Drag from one element to another. Each side takes a snapshot ref or a CSS selector.",
    {
      type: "object",
      properties: {
        startRef: {
          type: "string",
          description: "Snapshot ref to drag from.",
        },
        endRef: {
          type: "string",
          description: "Snapshot ref to drop onto.",
        },
        startElement: {
          type: "string",
          description:
            "CSS selector to drag from, instead of startRef. Drag handles are usually " +
            "role-less div with no snapshot ref.",
        },
        endElement: {
          type: "string",
          description: "CSS selector to drop onto, instead of endRef.",
        },
        targetId: {
          type: "string",
          description: "Tab id. Default first tab.",
        },
      },
    },
    async (args: {
      startRef?: string;
      endRef?: string;
      startElement?: string;
      endElement?: string;
      targetId?: string;
    }) => {
      if (!config.cdpEndpoint) throw new Error("CDP endpoint not configured");

      await dragViaPlaywright({
        cdpUrl: config.cdpEndpoint,
        targetId: args.targetId,
        startRef: args.startRef,
        endRef: args.endRef,
        startElement: args.startElement,
        endElement: args.endElement,
      });

      const from = args.startRef ?? args.startElement;
      const to = args.endRef ?? args.endElement;
      return `**Dragged** ${from} onto ${to}`;
    }
  );

  // browser_resize
  register(
    "browser_resize",
    "Resize tab viewport.",
    {
      type: "object",
      properties: {
        width: { type: "number", description: "Width in pixels." },
        height: { type: "number", description: "Height in pixels." },
        targetId: {
          type: "string",
          description: "Tab id. Default first tab.",
        },
      },
      required: ["width", "height"],
    },
    async (args: { width: number; height: number; targetId?: string }) => {
      if (!config.cdpEndpoint) throw new Error("CDP endpoint not configured");

      await resizeViewportViaPlaywright({
        cdpUrl: config.cdpEndpoint,
        targetId: args.targetId,
        width: args.width,
        height: args.height,
      });

      return `**Resized** to ${args.width}x${args.height}`;
    }
  );

  // browser_close
  register(
    "browser_close",
    "Close tab. Inside a tab group, prefer browser_tabs with action close.",
    {
      type: "object",
      properties: {
        targetId: {
          type: "string",
          description: "Tab id to close. Default first tab.",
        },
      },
    },
    async (args: { targetId?: string }) => {
      if (!config.cdpEndpoint) throw new Error("CDP endpoint not configured");

      await closePageViaPlaywright({
        cdpUrl: config.cdpEndpoint,
        targetId: args.targetId,
      });

      return "**Closed** tab";
    }
  );

  // browser_navigate_back
  register(
    "browser_navigate_back",
    "Go back in tab history, or forward.",
    {
      type: "object",
      properties: {
        forward: {
          type: "boolean",
          description: "Go forward instead of back.",
        },
        targetId: {
          type: "string",
          description: "Tab id. Default first tab.",
        },
      },
    },
    async (args: { forward?: boolean; targetId?: string }) => {
      if (!config.cdpEndpoint) throw new Error("CDP endpoint not configured");

      const direction = args.forward ? "forward" : "back";
      const result = await navigateHistoryViaPlaywright({
        cdpUrl: config.cdpEndpoint,
        targetId: args.targetId,
        direction,
      });

      return `**Navigated ${direction}**\nURL: ${result.url}`;
    }
  );

  register(
    "browser_find",
    "Search accessibility snapshot for text or regex. Returns matching lines with context. " +
      "Cheaper than a full snapshot when you only need to locate one element.",
    {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Case-insensitive substring. Pass text or regex, not both.",
        },
        regex: {
          type: "string",
          description: 'Regular expression. Wrap in slashes for flags: "/error/i".',
        },
        targetId: {
          type: "string",
          description: "Tab id. Default first tab.",
        },
      },
    },
    async (args: { text?: string; regex?: string; targetId?: string }) => {
      if (!config.cdpEndpoint) throw new Error("CDP endpoint not configured");

      const result = await findInSnapshotViaPlaywright({
        cdpUrl: config.cdpEndpoint,
        targetId: args.targetId,
        text: args.text,
        regex: args.regex,
      });

      if (!result.hits.length) {
        return `**No matches** in ${result.snapshotLines} snapshot lines`;
      }
      return result;
    }
  );

  register(
    "browser_handle_dialog",
    "Accept or dismiss alert, confirm, prompt. Handles a dialog already open, otherwise arms " +
      "the next dialog on this tab. To control the answer, arm before the click that opens the " +
      "dialog. An unanswered dialog blocks the tab, so the server auto-dismisses it after about " +
      "3 seconds.",
    {
      type: "object",
      properties: {
        accept: {
          type: "boolean",
          description: "True accepts. False dismisses.",
        },
        promptText: {
          type: "string",
          description: "Text to enter in a prompt dialog.",
        },
        targetId: {
          type: "string",
          description: "Tab id. Default first tab.",
        },
      },
      required: ["accept"],
    },
    async (args: { accept: boolean; promptText?: string; targetId?: string }) => {
      if (!config.cdpEndpoint) throw new Error("CDP endpoint not configured");

      const result = await handleDialogViaPlaywright({
        cdpUrl: config.cdpEndpoint,
        targetId: args.targetId,
        accept: args.accept,
        promptText: args.promptText,
      });

      if (result.handled) {
        return `**Handled ${result.type} dialog:** ${result.message ?? ""}`;
      }
      if (result.autoDismissed) {
        return (
          `**Armed** — the next dialog on this tab will be handled.\n` +
          `Note: an unanswered ${result.autoDismissed.type} dialog ("${result.autoDismissed.message}") ` +
          `opened at ${result.autoDismissed.at} and was auto-dismissed to unblock the tab. ` +
          `Re-run the action now that this tab is armed.`
        );
      }
      return "**Armed** — the next dialog on this tab will be handled";
    }
  );

  register(
    "browser_drop",
    "Drop files or MIME data onto element, as if dragged from outside the page. Pass paths, " +
      "data, or both.",
    {
      type: "object",
      properties: {
        ref: {
          type: "string",
          description: "Snapshot ref, such as e1.",
        },
        element: {
          type: "string",
          description:
            "CSS selector instead of ref. Drop zones are usually role-less div with no " +
            "snapshot ref. Cannot combine with ref.",
        },
        paths: {
          type: "array",
          items: { type: "string" },
          description: "Absolute file paths. Uses the file input when ref is one.",
        },
        data: {
          type: "object",
          additionalProperties: { type: "string" },
          description: 'MIME map: {"text/plain": "hello"}',
        },
        targetId: {
          type: "string",
          description: "Tab id. Default first tab.",
        },
      },
    },
    async (args: {
      ref?: string;
      element?: string;
      paths?: string[];
      data?: Record<string, string>;
      targetId?: string;
    }) => {
      if (!config.cdpEndpoint) throw new Error("CDP endpoint not configured");

      await dropViaPlaywright({
        cdpUrl: config.cdpEndpoint,
        targetId: args.targetId,
        ref: args.ref,
        element: args.element,
        paths: args.paths,
        data: args.data,
      });

      return `**Dropped** onto ${args.ref ?? args.element}`;
    }
  );
}
