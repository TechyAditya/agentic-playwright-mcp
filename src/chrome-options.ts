/**
 * Chrome options shared by the MCP server CLI and the Chrome daemon CLI.
 */

import { Option, type Command } from "commander";

/** Raw option values as commander reports them. */
export interface ChromeOptionValues {
  chromeUserDataDir?: string;
  chromeExtensions?: string;
  chromeExecutable?: string;
  downloadDir?: string;
  keepAlive?: boolean;
}

/** Chrome settings in the shape the server config and the daemon `--config` JSON use. */
export interface ChromeConfig {
  chromeUserDataDir?: string;
  chromeExtensions?: string[];
  chromeExecutable?: string;
  downloadDir?: string;
  keepAlive?: boolean;
}

/**
 * Register the Chrome options on a command. Each option reads its default from the
 * environment variable of the same name in upper snake case.
 */
export function addChromeOptions(command: Command): Command {
  command
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
    .addOption(new Option("--no-keep-alive").hideHelp());

  return command;
}

/** Split a comma-separated extension list, dropping blank entries. */
export function parseChromeExtensions(value: string | undefined): string[] | undefined {
  return value?.split(",").map((entry) => entry.trim()).filter(Boolean);
}

/** Convert parsed Chrome options into the config shape. Unset options stay undefined. */
export function chromeConfigFromOptions(options: ChromeOptionValues): ChromeConfig {
  return {
    chromeUserDataDir: options.chromeUserDataDir,
    chromeExtensions: parseChromeExtensions(options.chromeExtensions),
    chromeExecutable: options.chromeExecutable,
    downloadDir: options.downloadDir,
    keepAlive: options.keepAlive,
  };
}
