/**
 * Browser action tools - click, type, hover, etc.
 */

import type { ServerConfig } from "../../config.js";
import type { RegisterToolFn } from "../types.js";
import {
  clickViaPlaywright,
  typeViaPlaywright,
  hoverViaPlaywright,
  pressKeyViaPlaywright,
  fillFormViaPlaywright,
  waitForViaPlaywright,
  evaluateViaPlaywright,
  type BrowserFormField,
} from "../../browser/pw-tools-interactions.js";

export function registerBrowserActionTools(
  register: RegisterToolFn,
  config: ServerConfig
) {
  // browser_click
  register(
    "browser_click",
    "Click element by snapshot ref, or by CSS selector in element.",
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
            "CSS selector instead of ref. Use when snapshot gives no ref, such as role-less " +
            "div or span. Cannot combine with ref.",
        },
        targetId: {
          type: "string",
          description: "Tab id. Default first tab.",
        },
        button: {
          type: "string",
          enum: ["left", "right", "middle"],
          description: "Mouse button. Default left.",
        },
        doubleClick: {
          type: "boolean",
          description: "Double-click instead.",
        },
      },
    },
    async (args: {
      ref?: string;
      element?: string;
      targetId?: string;
      button?: "left" | "right" | "middle";
      doubleClick?: boolean;
    }) => {
      if (!config.cdpEndpoint) throw new Error("CDP endpoint not configured");

      await clickViaPlaywright({
        cdpUrl: config.cdpEndpoint,
        targetId: args.targetId,
        ref: args.ref,
        element: args.element,
        button: args.button,
        doubleClick: args.doubleClick,
      });

      return `**Clicked** element ${args.ref ?? args.element}`;
    }
  );

  // browser_type
  register(
    "browser_type",
    "Type text into element.",
    {
      type: "object",
      properties: {
        ref: {
          type: "string",
          description: "Snapshot ref, such as e1.",
        },
        text: {
          type: "string",
          description: "Text to type.",
        },
        targetId: {
          type: "string",
          description: "Tab id. Default first tab.",
        },
        submit: {
          type: "boolean",
          description: "Press Enter after typing.",
        },
      },
      required: ["ref", "text"],
    },
    async (args: { ref: string; text: string; targetId?: string; submit?: boolean }) => {
      if (!config.cdpEndpoint) throw new Error("CDP endpoint not configured");

      await typeViaPlaywright({
        cdpUrl: config.cdpEndpoint,
        targetId: args.targetId,
        ref: args.ref,
        text: args.text,
        submit: args.submit,
      });

      return `**Typed** "${args.text}" into ${args.ref}`;
    }
  );

  // browser_hover
  register(
    "browser_hover",
    "Hover element by snapshot ref, or by CSS selector in element.",
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
            "CSS selector instead of ref. Use when snapshot gives no ref, such as role-less " +
            "div or span. Cannot combine with ref.",
        },
        targetId: {
          type: "string",
          description: "Tab id. Default first tab.",
        },
      },
    },
    async (args: { ref?: string; element?: string; targetId?: string }) => {
      if (!config.cdpEndpoint) throw new Error("CDP endpoint not configured");

      await hoverViaPlaywright({
        cdpUrl: config.cdpEndpoint,
        targetId: args.targetId,
        ref: args.ref,
        element: args.element,
      });

      return `**Hovered** over ${args.ref ?? args.element}`;
    }
  );

  // browser_press_key
  register(
    "browser_press_key",
    "Press keyboard key on focused element.",
    {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "Key name: Enter, Escape, ArrowDown.",
        },
        targetId: {
          type: "string",
          description: "Tab id. Default first tab.",
        },
      },
      required: ["key"],
    },
    async (args: { key: string; targetId?: string }) => {
      if (!config.cdpEndpoint) throw new Error("CDP endpoint not configured");

      await pressKeyViaPlaywright({
        cdpUrl: config.cdpEndpoint,
        targetId: args.targetId,
        key: args.key,
      });

      return `**Pressed** key: ${args.key}`;
    }
  );

  // browser_fill_form
  register(
    "browser_fill_form",
    "Fill many form fields in one call.",
    {
      type: "object",
      properties: {
        fields: {
          type: "array",
          description: "Fields to fill. Each needs ref and type.",
          items: {
            type: "object",
            properties: {
              ref: { type: "string" },
              type: { type: "string" },
              value: { type: ["string", "number", "boolean"] },
            },
            required: ["ref", "type"],
          },
        },
        targetId: {
          type: "string",
          description: "Tab id. Default first tab.",
        },
      },
      required: ["fields"],
    },
    async (args: { fields: BrowserFormField[]; targetId?: string }) => {
      if (!config.cdpEndpoint) throw new Error("CDP endpoint not configured");

      await fillFormViaPlaywright({
        cdpUrl: config.cdpEndpoint,
        targetId: args.targetId,
        fields: args.fields,
      });

      return `**Filled** ${args.fields.length} form field(s)`;
    }
  );

  // browser_wait_for
  register(
    "browser_wait_for",
    "Wait for condition: text, selector, url, load state, or time.",
    {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Wait until text appears.",
        },
        textGone: {
          type: "string",
          description: "Wait until text gone.",
        },
        selector: {
          type: "string",
          description: "Wait until CSS selector appears.",
        },
        url: {
          type: "string",
          description: "Wait until URL matches pattern.",
        },
        loadState: {
          type: "string",
          enum: ["load", "domcontentloaded", "networkidle"],
          description: "Wait for load state.",
        },
        timeMs: {
          type: "number",
          description: "Wait this many milliseconds.",
        },
        targetId: {
          type: "string",
          description: "Tab id. Default first tab.",
        },
      },
    },
    async (args: {
      text?: string;
      textGone?: string;
      selector?: string;
      url?: string;
      loadState?: "load" | "domcontentloaded" | "networkidle";
      timeMs?: number;
      targetId?: string;
    }) => {
      if (!config.cdpEndpoint) throw new Error("CDP endpoint not configured");

      await waitForViaPlaywright({
        cdpUrl: config.cdpEndpoint,
        targetId: args.targetId,
        text: args.text,
        textGone: args.textGone,
        selector: args.selector,
        url: args.url,
        loadState: args.loadState,
        timeMs: args.timeMs,
      });

      const conditions = [
        args.text && `text: "${args.text}"`,
        args.textGone && `text gone: "${args.textGone}"`,
        args.selector && `selector: ${args.selector}`,
        args.url && `URL: ${args.url}`,
        args.loadState && `load state: ${args.loadState}`,
        args.timeMs && `${args.timeMs}ms`,
      ].filter(Boolean);

      return `**Wait completed** for ${conditions.join(", ")}`;
    }
  );

  // browser_evaluate
  register(
    "browser_evaluate",
    "Run JS in page via page.evaluate(). Use for elements the snapshot omits: portal div, " +
      "framework overlay, shadow DOM. Can click hidden element, read data, change DOM. " +
      "Cross-origin fetch fails CORS here, so use browser_run_code_unsafe with page.request.",
    {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description:
            "JS expression or function. Example: `document.title` or " +
            "`() => document.querySelector('.menu').click()`. With ref: `(el) => el.textContent`.",
        },
        ref: {
          type: "string",
          description: "Snapshot ref, such as e1. Expression gets element as first argument.",
        },
        targetId: {
          type: "string",
          description: "Tab id. Default first tab.",
        },
      },
      required: ["expression"],
    },
    async (args: { expression: string; ref?: string; targetId?: string }) => {
      if (!config.cdpEndpoint) throw new Error("CDP endpoint not configured");

      const result = await evaluateViaPlaywright({
        cdpUrl: config.cdpEndpoint,
        targetId: args.targetId,
        fn: args.expression,
        ref: args.ref,
      });

      // Format the result for display
      if (result === undefined) return "**Evaluated** — returned `undefined`";
      if (result === null) return "**Evaluated** — returned `null`";
      if (typeof result === "string") return `**Evaluated** — returned: "${result}"`;
      if (typeof result === "number" || typeof result === "boolean")
        return `**Evaluated** — returned: ${result}`;
      return `**Evaluated** — returned:\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``;
    }
  );
}
