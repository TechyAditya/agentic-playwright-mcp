#!/usr/bin/env node

/**
 * CLI entry point for agentic-playwright-mcp
 */

import { createRequire } from "node:module";
import { program } from "commander";
import { runServer } from "./mcp/server.js";
import type { ServerConfig } from "./config.js";
import { validateConfig } from "./config.js";

const { version } = createRequire(import.meta.url)("../package.json") as {
  version: string;
};

program
  .name("agentic-playwright-mcp")
  .description("Fork of official Playwright MCP with tab isolation via targetId")
  .version(version)
  .option(
    "--cdp-endpoint <url>",
    "CDP endpoint URL (default: auto-start daemon on localhost:9223)",
    process.env.CDP_ENDPOINT
  )
  .option("--agent-id <id>", "Optional agent ID for logging/debugging", process.env.AGENT_ID)
  .option(
    "--chrome-user-data-dir <path>",
    "Chrome profile directory (default: ~/.agentic-playwright-mcp/chrome-profile)",
    process.env.CHROME_USER_DATA_DIR
  )
  .option(
    "--chrome-extensions <ids>",
    "Chrome Web Store extension IDs (comma-separated)",
    process.env.CHROME_EXTENSIONS
  )
  .option(
    "--chrome-executable <path>",
    "Path to Chrome executable (auto-detected if not provided)",
    process.env.CHROME_EXECUTABLE
  )
  .option(
    "--download-dir <path>",
    "Download directory for Chrome (default: ~/.agentic-playwright-mcp/downloads)",
    process.env.DOWNLOAD_DIR
  )
  .option(
    "--keep-alive",
    "Auto-restart daemon-managed Chrome if it exits (use --no-keep-alive to disable)",
    process.env.KEEP_ALIVE ? process.env.KEEP_ALIVE !== "false" : false
  )
  .option(
    "--checkpoint-output-dir <path>",
    "Directory for checkpoint manifests, artifacts, and reports (default: ~/.agentic-playwright-mcp/checkpoints)",
    process.env.CHECKPOINT_OUTPUT_DIR
  )
  .action(async (options) => {
    const config: ServerConfig = {
      cdpEndpoint: options.cdpEndpoint,
      agentId: options.agentId,
      chromeUserDataDir: options.chromeUserDataDir,
      chromeExtensions: options.chromeExtensions?.split(",").map((s: string) => s.trim()).filter(Boolean),
      chromeExecutable: options.chromeExecutable,
      downloadDir: options.downloadDir,
      keepAlive: options.keepAlive,
      checkpointOutputDir: options.checkpointOutputDir,
    };

    try {
      validateConfig(config);
      await runServer(config);
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program.parse();
