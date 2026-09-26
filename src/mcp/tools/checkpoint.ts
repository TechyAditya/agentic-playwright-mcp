import type { ServerConfig } from "../../config.js";
import type { RegisterToolFn } from "../types.js";
import {
  captureCheckpointViaPlaywright,
  formatCheckpointCaptureResult,
  formatCheckpointReportResult,
  generateCheckpointReport,
} from "../../browser/pw-tools-checkpoint.js";

export function registerBrowserCheckpointTools(
  register: RegisterToolFn,
  config: ServerConfig,
) {
  register(
    "browser_checkpoint",
    "Capture structured checkpoint for one tab. Writes artifacts and a manifest under the " +
      "server checkpoint directory.",
    {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Checkpoint name. Must be unique.",
        },
        targetId: {
          type: "string",
          description: "Tab id. Default first tab.",
        },
        description: {
          type: "string",
          description: "What this checkpoint captures.",
        },
        highlightSelector: {
          type: "string",
          description: "CSS selector to highlight in the screenshot.",
        },
        fullPage: {
          type: "boolean",
          description: "Capture full-page screenshot.",
        },
        collectors: {
          type: "object",
          description:
            "Per-collector overrides. Set a collector to false to disable it, or pass options.",
          additionalProperties: true,
        },
      },
      required: ["name"],
    },
    async (args: {
      name: string;
      targetId?: string;
      description?: string;
      highlightSelector?: string;
      fullPage?: boolean;
      collectors?: Record<string, boolean | Record<string, unknown>>;
    }) => {
      if (!config.cdpEndpoint) {
        throw new Error("CDP endpoint not configured");
      }

      const result = await captureCheckpointViaPlaywright({
        cdpUrl: config.cdpEndpoint,
        name: args.name,
        targetId: args.targetId,
        description: args.description,
        highlightSelector: args.highlightSelector,
        fullPage: args.fullPage,
        collectors: args.collectors,
        outputDir: config.checkpointOutputDir,
        agentId: config.agentId,
      });

      return formatCheckpointCaptureResult(result);
    },
  );

  register(
    "browser_checkpoint_report",
    "Generate report from stored checkpoint manifests.",
    {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: ["html", "markdown", "mdx"],
          description: "One report format per call. Default html.",
        },
        resultsDir: {
          type: "string",
          description:
            "Directory holding checkpoint manifests. Default server-managed results directory.",
        },
      },
    },
    async (args: {
      format?: "html" | "markdown" | "mdx";
      resultsDir?: string;
    }) => {
      const result = await generateCheckpointReport({
        outputDir: config.checkpointOutputDir,
        resultsDir: args.resultsDir,
        format: args.format,
      });

      return formatCheckpointReportResult(result);
    },
  );
}
