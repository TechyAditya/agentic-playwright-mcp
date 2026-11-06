#!/usr/bin/env node

/**
 * CLI entry point for agentic-playwright-mcp
 */

import { createRequire } from "node:module";
import { program } from "commander";
import { runServer } from "./mcp/server.js";
import type { ServerConfig } from "./config.js";
import { validateConfig } from "./config.js";
import { addChromeOptions, chromeConfigFromOptions } from "./chrome-options.js";

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
  .option("--agent-id <id>", "Optional agent ID for logging/debugging", process.env.AGENT_ID);

addChromeOptions(program);

program
  .option(
    "--checkpoint-output-dir <path>",
    "Directory for checkpoint manifests, artifacts, and reports (default: ~/.agentic-playwright-mcp/checkpoints)",
    process.env.CHECKPOINT_OUTPUT_DIR
  )
  .action(async (options) => {
    const config: ServerConfig = {
      cdpEndpoint: options.cdpEndpoint,
      agentId: options.agentId,
      ...chromeConfigFromOptions(options),
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
