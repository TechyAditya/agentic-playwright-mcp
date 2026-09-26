# agentic-playwright-mcp

`agentic-playwright-mcp` lets multiple agents control one Chrome instance without sending
commands to the wrong tab. Each browser tool accepts a `targetId`. Agents can also use a
`groupId` to list and control only their own tabs.

This package is an independent fork of
[Playwright MCP](https://github.com/microsoft/playwright-mcp). It is not a Microsoft
package.

## Run the MCP server

Use this command as the server command in your MCP client:

```bash
npx --yes agentic-playwright-mcp
```

For clients that use JSON configuration, add:

```json
{
  "mcpServers": {
    "agentic-playwright-mcp": {
      "command": "npx",
      "args": ["--yes", "agentic-playwright-mcp"]
    }
  }
}
```

The command starts an MCP server over standard input and output. It waits for requests
from an MCP client, so running it directly does not open a prompt or web page.

Chrome starts when the client calls the first browser tool. The server uses one headed
Chrome instance and stores its profile in `~/.agentic-playwright-mcp`.

To restart Chrome if it exits, add `--keep-alive` to the arguments:

```json
"args": ["--yes", "agentic-playwright-mcp", "--keep-alive"]
```

To connect to an existing browser, start Chrome with remote debugging and add
`--cdp-endpoint`:

```json
"args": [
  "--yes",
  "agentic-playwright-mcp",
  "--cdp-endpoint",
  "http://localhost:9222"
]
```

## Install the CLI

Install the package globally if you do not want the MCP client to run it through `npx`:

```bash
npm install --global agentic-playwright-mcp
apmcp --help
```

The package installs these commands:

- `agentic-playwright-mcp` and `apmcp` start the MCP server.
- `agentic-playwright-mcp-daemon` and `apmcp-daemon` manage the Chrome daemon.

## Keep agent tabs separate

1. Call `browser_tab_group` with `action: "create"`. Save the returned `groupId`.
2. Call `browser_tabs` with `action: "new"` and the `groupId`. Save the returned
   `targetId`.
3. Pass the same `targetId` and `groupId` to later browser calls.

Cookies, local storage, and sign-in state remain shared because all groups use the same
Chrome profile. A person can complete an interactive sign-in, then the agent can continue
on the same `targetId`.

## Security

`browser_run_code_unsafe` runs JavaScript with access to the selected Playwright page.
Only let trusted clients call this tool.

The Chrome DevTools Protocol endpoint listens on `localhost:9223` by default. Do not
expose this port to other machines.

## Documentation

- [Share one browser between agents](https://github.com/TechyAditya/agentic-playwright-mcp/blob/main/docs/shared-browser.md)
- [Tool reference](https://github.com/TechyAditya/agentic-playwright-mcp/blob/main/docs/tools.md)
- [CLI reference](https://github.com/TechyAditya/agentic-playwright-mcp/blob/main/docs/cli.md)
- [Chrome extension notes](https://github.com/TechyAditya/agentic-playwright-mcp/blob/main/docs/chrome-extensions.md)
- [Test suite](https://github.com/TechyAditya/agentic-playwright-mcp/blob/main/tests/e2e/README.md)

## Develop from source

```bash
git clone https://github.com/TechyAditya/agentic-playwright-mcp.git
cd agentic-playwright-mcp
npm ci
npm run build
npm test
npm run test:e2e
```

## Differences from Playwright MCP

| Capability | agentic-playwright-mcp | Playwright MCP |
| --- | --- | --- |
| Tab selection | Each browser tool accepts `targetId` | One implicit current tab |
| Agent isolation | `groupId` limits each agent to its tabs | No tab groups |
| Browser session | One headed Chrome profile with shared cookies | Separate browser by default |
| Checkpoints | Captures checkpoints and generates reports | No checkpoint tools |

Use Playwright MCP when one agent owns the browser. Use this package when agents must
share a signed-in browser without sharing tab control.

## License and attribution

This project includes work by [Patrick Menlove](https://github.com/pm990320) and code from
[OpenClaw](https://github.com/openclaw/openclaw). See the
[license file](https://github.com/TechyAditya/agentic-playwright-mcp/blob/main/LICENSE)
for attribution and license terms.
