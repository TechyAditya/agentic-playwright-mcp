/**
 * browser_screenshot tool - capture page or element screenshots
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { ServerConfig } from "../../config.js";
import type { RegisterToolFn } from "../types.js";
import { takeScreenshotViaPlaywright } from "../../browser/pw-tools-interactions.js";

const SCREENSHOTS_DIR = join(homedir(), ".agentic-playwright-mcp", "screenshots");

export function registerBrowserScreenshotTool(
  register: RegisterToolFn,
  config: ServerConfig
) {
  register(
    "browser_screenshot",
    "Screenshot page or one element. Pass ref or element to capture one element. Omit both to " +
      "capture the viewport. Default saves to file and returns the path, which keeps image data " +
      "out of the context window.",
    {
      type: "object",
      properties: {
        targetId: {
          type: "string",
          description: "Tab id. Default first tab.",
        },
        ref: {
          type: "string",
          description: "Snapshot ref, such as e1.",
        },
        element: {
          type: "string",
          description: "CSS selector instead of ref. Ignored when ref is set.",
        },
        fullPage: {
          type: "boolean",
          description:
            "Capture full scrollable page instead of viewport. Default false. Not compatible " +
            "with ref or element.",
        },
        type: {
          type: "string",
          enum: ["png", "jpeg"],
          description: "Image format. Default png. jpeg gives smaller files.",
        },
        quality: {
          type: "number",
          description:
            "jpeg quality, 1-100. Default 80. Lower is smaller. Only applies when type is jpeg.",
        },
        maxWidth: {
          type: "number",
          description: "Max width in pixels. Scales down proportionally when wider.",
        },
        returnAs: {
          type: "string",
          enum: ["file", "base64"],
          description:
            "file saves to disk and returns the path, which keeps image data out of the context " +
            "window. base64 returns inline image data. Default file.",
        },
        savePath: {
          type: "string",
          description:
            "File path to save to. Only used when returnAs is file. Default " +
            "~/.agentic-playwright-mcp/screenshots/ with a timestamp name.",
        },
      },
    },
    async (args: {
      targetId?: string;
      ref?: string;
      element?: string;
      fullPage?: boolean;
      type?: "png" | "jpeg";
      quality?: number;
      maxWidth?: number;
      returnAs?: "file" | "base64";
      savePath?: string;
    }) => {
      if (!config.cdpEndpoint) {
        throw new Error("CDP endpoint not configured");
      }

      const { buffer } = await takeScreenshotViaPlaywright({
        cdpUrl: config.cdpEndpoint,
        targetId: args.targetId,
        ref: args.ref,
        element: args.element,
        fullPage: args.fullPage,
        type: args.type,
        quality: args.quality,
        maxWidth: args.maxWidth,
      });

      const ext = args.type === "jpeg" ? "jpg" : "png";
      const mimeType = args.type === "jpeg" ? "image/jpeg" : "image/png";
      const returnAs = args.returnAs ?? "file";

      if (returnAs === "file") {
        // Save to disk, return path + metadata
        const filePath = args.savePath ?? generateScreenshotPath(ext);
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, buffer);
        const sizeKB = Math.round(buffer.length / 1024);

        return `Screenshot saved: ${filePath} (${sizeKB}KB, ${mimeType})`;
      }

      // Legacy: return inline base64
      const base64 = buffer.toString("base64");
      return {
        __image: true,
        mimeType,
        base64,
      };
    }
  );
}

function generateScreenshotPath(ext: string): string {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return join(SCREENSHOTS_DIR, `screenshot-${ts}.${ext}`);
}
