# Agent notes for this package

This is a fork of Playwright MCP (`microsoft/playwright-mcp`). It is not Microsoft's
package. The package is published as `agentic-playwright-mcp`, stores profiles under
`~/.agentic-playwright-mcp`, and uses `apmcp` as the short CLI alias.

## Driving the browser

- Pass `targetId` on every call that takes one.
- Create a group with `browser_tab_group` when more than one agent shares the Chrome.
- Reuse the tab a person just used. Do not open a new one to inspect the result.
- For Node-side HTTP as the logged-in user, use `browser_run_code_unsafe` with
  `page.request`.
- When the snapshot gives no `ref`, pass `element` with a CSS selector.
- Arm `browser_handle_dialog` before the click that opens a dialog.

[How to share one browser between agents](docs/shared-browser.md) explains each of these
with examples.

## After changing tools

```bash
npm test
npm run test:e2e
npm run docs:tools
```

`tests/e2e/README.md` maps tools to specs. `tool-coverage.e2e.test.ts` fails when a new
tool has no spec. `docs/tools.md` is generated, so regenerate it instead of editing it.

This file is not the Audit360 workspace runbook. That one lives at the workspace root.
