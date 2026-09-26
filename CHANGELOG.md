# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.1] - 2026-09-27

### Fixed

- Attach Playwright listeners before navigating tabs created through the companion
  extension, so page-load console and network events are retained.
- Wait for an extension-created target to appear in Playwright before using or closing it.
- Refuse ambiguous URL-based target matches instead of selecting another agent's tab.

### Tests

- Verify that a group remains after its first tab closes and disappears after its last tab
  closes.

## [1.2.0] - 2026-09-26

### Added

- Include the companion tab-group extension in the npm package.
- Load the bundled tab-group extension automatically through CDP on npm and `npx` runs.
- Show native Chrome group names and IDs in tab and group listings.

### Changed

- Tell agents to prefer human-readable tab-group names under 20 characters.

### Fixed

- Remove empty MCP groups after their last tab closes. Unused new groups expire after 60
  seconds.
- Use a fixed extension ID across npm installation and `npx` cache paths.

## [1.1.0] - 2026-09-26

### Fixed

- A tab a page opened for itself belonged to no group. Only `browser_tabs` with
  `action: "new"` recorded membership, so a `target="_blank"` link produced an ungrouped
  tab that a group-scoped listing never showed. Two agents sharing one Chrome could each
  read it as their own and drive the other's page. A popup now joins the group its opener
  is in.

## [1.0.1] - 2026-09-26

### Changed

- Reworked the package README around the `npx --yes agentic-playwright-mcp` setup.
- Changed documentation links to absolute GitHub URLs so they work on npmjs.com.

## [1.0.0] - 2026-09-26

Registers 15 more tools, for 29 in total, and keeps the tab isolation Playwright MCP does not have.

### Added

- 15 tools: `browser_close`, `browser_console_messages`, `browser_drag`, `browser_drop`, `browser_file_upload`, `browser_find`, `browser_handle_dialog`, `browser_navigate_back`, `browser_network_request`, `browser_network_requests`, `browser_network_response_body`, `browser_page_errors`, `browser_resize`, `browser_run_code_unsafe`, and `browser_select_option`.
- CSS `element` selectors on click, hover, drag, drop, screenshot, and file upload, for role-less targets that never get a snapshot `ref`.
- Vitest e2e suite (`npm run test:e2e`) that drives the built server against a local fixture and fails if a registered tool has no spec.

### Fixed

- Screenshots on Windows. The save path was split on `/`, so `mkdir` got an empty string.
- `browser_network_response_body` only waited for future traffic. Historical lookups now read the tab's recorded requests first.
- `browser_navigate_back` used in-page `history.back()`, which died when the execution context was destroyed. It now calls Playwright `goBack` and `goForward`, and treats a URL change as success when Chromium restores from bfcache.
- An unanswered dialog blocked the whole shared Chrome. The server now dismisses it after about three seconds.
- `playwright-checkpoint` resolved `@playwright/test` from `process.cwd()`, which broke when an MCP client started the server from the home directory.

## [0.2.1] - 2026-04-03


### Bug Fixes

* use tag_name for checkout to fix npm publish
* use tag_name output for checkout instead of github.ref

## [0.2.0] - 2026-04-03


### Features

* comprehensive stealth script injection
* expose snapshot filtering options and screenshot quality for small-model friendliness
* stealth mode - remove automation fingerprints from Chrome


### Bug Fixes

* guard publish job with tag check instead of releases_created condition
* guard publish job with tag existence check
* persist ref store to disk for cross-process ref resolution


### Miscellaneous

* add release-please automation and commitlint
* integrate npm publish into release-please workflow
* integrate npm publish into release-please workflow

## [0.1.1] - 2026-02-09

### Fixed

- Relaxed ESLint max-warnings for CI compatibility
- Added .npmrc to .gitignore

## [0.1.0] - 2026-02-09

### Added

- Initial release
- Tab group isolation for multi-agent browser sharing
- 10 MCP tools: tab_group, tabs, navigate, snapshot, click, type, hover, press_key, fill_form, wait_for
- CDP connection to existing Chrome instances
- Accessibility tree snapshots with element refs
- Chrome tab group extension for visual organization
- Persistent tab group registry (~/.agentic-playwright-mcp/tab-groups.json)
