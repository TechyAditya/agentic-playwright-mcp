# agentic-playwright-mcp

A fork of [Playwright MCP](https://github.com/microsoft/playwright-mcp) (`@playwright/mcp`)
that lets several agents drive one Chrome window without fighting over tabs. It is a
separate package, not Microsoft's.

Playwright MCP tracks one current tab. That is the right design for one agent. Point two
agents at it, or let one agent spawn five subagents, and they all act on whichever tab
moved last. The calls still succeed. They land on the wrong page.

In this fork, every tool that acts on a tab takes a `targetId`, so a call names the tab it
means. An optional `groupId` hides one agent's tabs from another. Cookies, single sign-on,
and local storage stay shared, because there is still only one browser and one profile.
Log in once and every agent inherits the session.

## Install

Run the published package directly from an MCP client:

```json
{
  "mcpServers": {
    "agentic-playwright-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "agentic-playwright-mcp@latest",
        "--keep-alive",
        "--agent-id",
        "cursor"
      ]
    }
  }
}
```

To install the short command globally instead:

```bash
npm install --global agentic-playwright-mcp
apmcp --help
```

Or install and build it from source:

```bash
git clone https://github.com/TechyAditya/agentic-playwright-mcp.git
cd agentic-playwright-mcp
npm ci
npm run build
```

Then point an MCP client at the built CLI using an absolute path:

```json
{
  "mcpServers": {
    "agentic-playwright-mcp": {
      "command": "node",
      "args": [
        "/absolute/path/to/agentic-playwright-mcp/dist/cli.js",
        "--keep-alive",
        "--agent-id",
        "cursor"
      ]
    }
  }
}
```

The server starts Chrome on the first tool call and serves CDP on `localhost:9223`.
`--keep-alive` makes the daemon restart Chrome if Chrome exits. The daemon is a detached
process, so Chrome outlives the MCP server either way. To attach to a Chrome you already
run, pass `--cdp-endpoint`.

On Windows, write the source checkout path with escaped backslashes in JSON, or use
forward slashes.
Runtime data, including the shared Chrome profile, lives in `~/.agentic-playwright-mcp`.

## Where to go next

- [How to share one browser between agents](docs/shared-browser.md) covers `targetId`,
  groups, handing a tab to a person, dialogs, CSS selectors for elements the snapshot
  cannot see, and calling APIs as the logged-in user.
- [Tool reference](docs/tools.md) lists all 29 tools and their parameters. Regenerate it
  with `npm run docs:tools` after you change a schema.
- [CLI reference](docs/cli.md) lists the flags, environment variables, and the files the
  server writes.
- [About visual tab groups and Chrome extensions](docs/chrome-extensions.md) explains why
  the companion extension often fails to load and what to do about it.
- [Test suite](tests/e2e/README.md) explains the two suites and which spec covers which
  tool.

## What this fork changed

Two things, and the second one took longer than the first.

Isolation came first. Every tool that acts on a tab takes a `targetId`, `groupId` gives an
agent its own set of tabs, and a registry on disk keeps the groups across a server restart.

Then the tool set had to catch up. The fork had drifted to 14 registered tools. Version
1.0.0 registered 15 more, for 29 in total: network inspection, console output, page errors,
dialogs, file upload, drag, drop, select, resize, close, history navigation, find, and
`browser_run_code_unsafe`. The same work fixed five problems that only appear under real
use:

- Screenshots failed on Windows. The code split the save path on `/`, so `mkdir` got an
  empty string.
- `browser_network_response_body` only watched for future traffic. Asking about a request
  that had already finished burned the full timeout and then failed.
- `browser_navigate_back` ran `history.back()` inside the page. That call dies when the
  execution context goes away mid-navigation.
- An unanswered `alert()` blocked the whole browser, not only its tab. Every tool then
  failed with a CDP timeout.
- Drag handles and drop zones have no accessible role, so no tool could reach them. They
  take a CSS selector now.

Each of those has a spec in `tests/e2e/`. `npm test` runs the unit tests with no browser.
`npm run test:e2e` drives the built server against a local fixture page and covers all 29
tools.

## Compared with Playwright MCP

| | This fork | Playwright MCP |
| --- | --- | --- |
| Naming a tab | `targetId` on every tool that acts on a tab | One implicit current tab |
| Isolating agents | `groupId` | none |
| Browser | One headed Chrome, one profile, shared cookies | Launches its own by default |
| Checkpoints | `browser_checkpoint` and a report generator | none |

Use Playwright MCP when one agent owns the browser. It is simpler and Microsoft maintains
it. Use this fork when several agents have to share a login.

## Lineage and licensing

This repository builds on prior MIT-licensed work by
[Patrick Menlove](https://github.com/pm990320), which took CDP session handling and tab isolation from
[OpenClaw](https://github.com/openclaw/openclaw). Both are MIT. Playwright MCP is
Apache-2.0. This repository is MIT. Keep the notices in [LICENSE](LICENSE).
