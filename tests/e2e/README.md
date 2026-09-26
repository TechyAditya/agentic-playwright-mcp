# End-to-end tool suite

This suite drives the built server (`dist/cli.js`) over stdio, the way an MCP client does,
and exercises every registered browser tool against a local fixture page.

```bash
npm run test:e2e        # builds first, then runs the suite, about 2 minutes
npm run test:e2e:watch
npm test                # unit tests only, no browser
npm run test:all        # both
```

## What it needs

The suite needs a working Chrome daemon, because the tools drive a real browser. It reuses
the shared instance the server manages, so Chrome opens tabs while the suite runs and you
can watch it. Tab groups and the group registry go to a temporary `APMCP_DATA_DIR`, and
checkpoints to a temporary output directory, so a run leaves no real state behind.

## Which spec covers which tool

| Spec | Tools |
| --- | --- |
| `tabs.e2e.test.ts` | `browser_tab_group`, `browser_tabs`, `browser_close` |
| `snapshot.e2e.test.ts` | `browser_snapshot`, `browser_find` |
| `interactions.e2e.test.ts` | `browser_click`, `browser_hover`, `browser_type`, `browser_press_key`, `browser_fill_form`, `browser_select_option`, `browser_wait_for` |
| `scripting.e2e.test.ts` | `browser_evaluate`, `browser_run_code_unsafe` |
| `network.e2e.test.ts` | `browser_network_requests`, `browser_network_request`, `browser_network_response_body` |
| `diagnostics.e2e.test.ts` | `browser_console_messages`, `browser_page_errors` |
| `dialogs.e2e.test.ts` | `browser_handle_dialog` |
| `files-drag-drop.e2e.test.ts` | `browser_file_upload`, `browser_drop`, `browser_drag` |
| `viewport.e2e.test.ts` | `browser_resize`, `browser_screenshot` |
| `navigation.e2e.test.ts` | `browser_navigate`, `browser_navigate_back` |
| `checkpoints.e2e.test.ts` | `browser_checkpoint`, `browser_checkpoint_report` |
| `tool-coverage.e2e.test.ts` | asserts the table above is complete |

`helpers/tool-coverage.ts` maps each tool to its spec. A newly registered tool fails
`tool-coverage.e2e.test.ts` until it is listed there and a spec covers it.

## Conventions

- One `startSession()` per spec. Each spec gets its own MCP server process, fixture HTTP
  server, tab group, and tab, so specs cannot see each other's tabs. That is the isolation
  this fork exists to provide, tested on itself.
- The helper spawns the server with `cwd` set to the home directory. A packaging bug once
  reproduced only from outside the package, so the working directory is part of the test.
- `fixtures/page.html` holds every element the tools need. Add to it rather than reaching
  for a public site. The suite has to pass offline.
- Assertions read the page through `session.readText()` and `session.evaluateJson()`, so
  they check what the page did, not that the tool returned a cheerful string.

## Regressions pinned here

Each spec below exists because of one specific bug. Keep their comments if you refactor.

- `viewport`: the screenshot path was split on `/`, so the directory came out empty on
  Windows.
- `navigation`: history navigation ran `page.evaluate(history.back)` and died with
  "Execution context was destroyed". The replacement then reported failure on success,
  because Chromium restores from bfcache and `goBack()` returns null.
- `dialogs`: an unanswered dialog blocked the whole shared Chrome, not only its tab.
- `network`: response bodies matched future traffic only, so historical lookups always
  timed out.
- `interactions` and `files-drag-drop`: role-less elements get no snapshot ref, which is
  why the `element` CSS-selector paths exist.
- `checkpoints`: `playwright-checkpoint` resolved `@playwright/test` from `process.cwd()`,
  so checkpoints failed whenever a client started the server outside the package.
