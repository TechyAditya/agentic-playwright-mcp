# Development instructions

This repository publishes `agentic-playwright-mcp`. It is an independent fork of
`microsoft/playwright-mcp`, not a Microsoft package.

## Set up the repository

Use Node.js 20 or 22 for development because CI tests both versions. The package supports
Node.js 18 and later.

```bash
npm ci
npm run build
```

Setup is complete when `npm ci` uses `package-lock.json` without changing it and
TypeScript builds `dist/` without errors.

## Work in the source tree

- Edit TypeScript in `src/`. The compiler generates `dist/`; Git ignores that directory.
- Keep `.js` extensions in relative imports. The package compiles to ES modules.
- Write MCP protocol output to standard output. Write diagnostics to standard error.
- Preserve the MIT notices in `LICENSE` and source-file attribution comments.
- Treat existing uncommitted changes as user work. Inspect them before editing the same
  file.

## Preserve tab isolation

Every tool that acts on a tab must accept and use `targetId`. Group-scoped operations must
reject a `targetId` that belongs to another `groupId`.

When changing tab ownership, popup behavior, group membership, dialogs, or authenticated
HTTP requests, read [docs/shared-browser.md](docs/shared-browser.md) before editing.

When driving the browser during development:

- Create a group with `browser_tab_group` when agents share Chrome.
- Pass `targetId` on every call that accepts it.
- Reuse the tab that a person used for sign-in or review.
- Use `browser_run_code_unsafe` with `page.request` for Node-side HTTP requests that need
  the signed-in browser session.
- Use an `element` CSS selector when `browser_snapshot` returns no `ref`.
- Arm `browser_handle_dialog` before the action that opens a dialog.

## Change a browser tool

1. Update the tool schema and registration in `src/mcp/tools/`.
2. Put Playwright behavior in `src/browser/` when the implementation needs page or browser
   state.
3. Add or update an end-to-end spec in `tests/e2e/`.
4. Update `tests/e2e/helpers/tool-coverage.ts` when the registered tool set changes.
5. Run the tool validation commands below.

Before adding, removing, or renaming a tool, read
[tests/e2e/README.md](tests/e2e/README.md). It maps each tool to its required spec and
describes the offline fixture conventions.

`docs/tools.md` is generated. Change the schema description, then regenerate the file.

```bash
npm test
npm run test:e2e
npm run docs:tools
```

Tool work is complete when every command passes, the new behavior has an end-to-end
assertion, and `tool-coverage.e2e.test.ts` reports no missing tool.

## Validate other changes

Run these commands for every code change:

```bash
npm run type-check
npm run lint
npm test
```

Run `npm run test:e2e` for changes to browser state, the daemon, MCP transport, tool
behavior, packaging, or runtime paths. The suite opens headed Chrome and uses temporary
state through `APMCP_DATA_DIR`.

Run `npm pack --dry-run` for changes to `package.json`, entry points, binaries, or files
included in the npm package.

## Change CLI or daemon behavior

Before changing flags, environment variables, runtime paths, daemon files, or binary
names, read [docs/cli.md](docs/cli.md). Keep the CLI help, that reference, and the README
examples consistent.

Runtime data belongs under `~/.agentic-playwright-mcp`. Tests must use temporary paths
instead of the developer's profile, downloads, screenshots, or checkpoints.

## Release a version

1. Update the version in `package.json` and `package-lock.json`.
2. Add the release entry to `CHANGELOG.md`.
3. Run the full validation commands and `npm pack --dry-run`.
4. Push the commit and its matching `vX.Y.Z` tag.
5. Publish a GitHub Release for that tag.

The GitHub Release triggers `.github/workflows/publish.yml`. npm Trusted Publishing signs
and publishes the package through OIDC. Use that workflow for releases rather than a local
`npm publish` command.
