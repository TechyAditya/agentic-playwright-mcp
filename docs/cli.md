# CLI reference

```text
node dist/cli.js [options]
```

The package installs `agentic-playwright-mcp` for the server and
`agentic-playwright-mcp-daemon` for the Chrome daemon. Short aliases are available as
`apmcp` and `apmcp-daemon`.

## Options

Each option has an environment variable of the same name in upper snake case.

| Option | Environment variable | Default | Description |
| --- | --- | --- | --- |
| `--cdp-endpoint <url>` | `CDP_ENDPOINT` | none | CDP endpoint to attach to. Without it, the server starts its own Chrome daemon on `localhost:9223`. |
| `--agent-id <id>` | `AGENT_ID` | none | Label for logs. Also the project name in checkpoint manifests. |
| `--chrome-user-data-dir <path>` | `CHROME_USER_DATA_DIR` | `~/.agentic-playwright-mcp/chrome-profile` | Chrome profile directory. |
| `--chrome-extensions <ids>` | `CHROME_EXTENSIONS` | none | Comma-separated list of Chrome Web Store extension ids, paths to unpacked extensions, or both. |
| `--chrome-executable <path>` | `CHROME_EXECUTABLE` | auto-detected | Chrome binary. |
| `--download-dir <path>` | `DOWNLOAD_DIR` | `~/.agentic-playwright-mcp/downloads` | Download directory for Chrome. |
| `--keep-alive` | `KEEP_ALIVE` | disabled | Restarts daemon-managed Chrome if Chrome exits. `--no-keep-alive` and `KEEP_ALIVE=false` disable it. |
| `--checkpoint-output-dir <path>` | `CHECKPOINT_OUTPUT_DIR` | `~/.agentic-playwright-mcp/checkpoints` | Root for checkpoint manifests, artifacts, and reports. |
| `-V, --version` | | | Prints the package version. |
| `-h, --help` | | | Prints help. |

## Chrome daemon

Without `--cdp-endpoint`, the server starts a Chrome daemon on the first tool call and
attaches to it on `localhost:9223`. The daemon is a detached process, so its Chrome
outlives the MCP server process. A lock file holds the daemon process id, and a second
server reuses a daemon that is already running.

When Chrome exits, the daemon restarts it if `--keep-alive` is set, and otherwise shuts
itself down.

The daemon looks for a Chrome binary in the puppeteer cache, then the Playwright cache,
then the system install locations, unless `--chrome-executable` names one.

## Files and directories

| Path | Contents |
| --- | --- |
| `~/.agentic-playwright-mcp/chrome-profile` | Chrome profile, including cookies and sessions. |
| `~/.agentic-playwright-mcp/tab-groups.json` | Tab group registry. Survives server restarts. |
| `~/.agentic-playwright-mcp/screenshots` | Screenshots, when `savePath` is omitted. |
| `~/.agentic-playwright-mcp/checkpoints` | Checkpoint manifests, artifacts, and reports. |
| `~/.agentic-playwright-mcp/downloads` | Chrome downloads. |
| `~/.agentic-playwright-mcp/extensions` | Chrome extensions downloaded from the Web Store. |
| `agentic-playwright-mcp-daemon.log` | Chrome daemon log, in the system temporary directory. |
| `agentic-playwright-mcp-daemon.lock` | Daemon lock file, in the system temporary directory. Holds the daemon process id. |

`APMCP_DATA_DIR` overrides the `~/.agentic-playwright-mcp` root for the tab group
registry. The test suites set it to a temporary directory.
