---
name: playwright-mcp
description: Browser automation via this Playwright MCP fork. Use when agent must control shared Chrome. Open tabs, navigate, click, type, fill forms, inspect network, run page.request. Pass targetId on every call that takes one. Use groupId when more than one agent shares the browser.
---

# Playwright MCP

Shared Chrome, isolated tabs. Fork of official `@playwright/mcp`.

## Workflow

1. If other agents will share this Chrome, create a group first. `browser_tab_group` with `action: "create"` and a name.
2. Open a tab. `browser_tabs` with `action: "new"`, that `groupId`, and a URL. Keep the `targetId`.
3. Pass that `targetId` on every later call. Do not open a second tab to "look again".
4. Snapshot before you click. Refs die after navigation.
5. Role-less elements have no `ref`. Pass `element` (CSS selector) instead.
6. For HTTP the page cannot make, use `browser_run_code_unsafe` with `page.request`.

## Tools

| Tool | Notes |
| --- | --- |
| `browser_tab_group` | create / list / delete |
| `browser_tabs` | new / list / select / close. `groupId` scopes list |
| `browser_close` | One tab by `targetId` |
| `browser_navigate` | URL |
| `browser_navigate_back` | `forward: true` to go forward |
| `browser_snapshot` | Refs like `e1` |
| `browser_find` | Search the last snapshot |
| `browser_click` | `ref` or `element` |
| `browser_hover` | `ref` or `element` |
| `browser_type` | `submit: true` presses Enter |
| `browser_press_key` | Enter, Escape, Tab, ArrowDown |
| `browser_fill_form` | Array of `{ref, type, value}` |
| `browser_select_option` | `values` array |
| `browser_wait_for` | text, selector, url, loadState, or timeMs |
| `browser_evaluate` | Page JS. Optional `ref` |
| `browser_run_code_unsafe` | Node-side Playwright. Use `page.request` to skip CORS |
| `browser_network_requests` | 1-based indexes |
| `browser_network_request` | `index` plus `part` |
| `browser_network_response_body` | Historical first. Re-fetch if Chrome dropped the body |
| `browser_console_messages` | Optional `level` |
| `browser_page_errors` | Uncaught errors |
| `browser_handle_dialog` | Arm before the click that opens the dialog |
| `browser_file_upload` | `paths` plus `inputRef` or `element` |
| `browser_drop` | `paths` or `data` |
| `browser_drag` | `startRef`/`endRef` or `startElement`/`endElement` |
| `browser_resize` | width, height |
| `browser_screenshot` | Saves a file by default |
| `browser_checkpoint` | Persist a capture |
| `browser_checkpoint_report` | Report from stored checkpoints |

## Isolation

- `targetId` names a tab. Omit it and the first tab wins.
- `groupId` hides other agents' tabs from list and close.
- Cookies and SSO are shared. That is the point of one Chrome.
