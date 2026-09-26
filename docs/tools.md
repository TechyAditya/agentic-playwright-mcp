# Tool reference

Every tool this server registers. 29 tools.

This file is generated from the tool schemas. To regenerate it, run `npm run docs:tools`.

Pass `targetId` on every tool that accepts one. Without it, the server falls back to the
first available tab, which is how two agents end up on the same page. To learn how the
isolation works, read [how to share one browser](shared-browser.md).

## `browser_checkpoint`

Capture structured checkpoint for one tab. Writes artifacts and a manifest under the server checkpoint directory.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | Checkpoint name. Must be unique. |
| `collectors` | object | no | Per-collector overrides. Set a collector to false to disable it, or pass options. |
| `description` | string | no | What this checkpoint captures. |
| `fullPage` | boolean | no | Capture full-page screenshot. |
| `highlightSelector` | string | no | CSS selector to highlight in the screenshot. |
| `targetId` | string | no | Tab id. Default first tab. |

## `browser_checkpoint_report`

Generate report from stored checkpoint manifests.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `format` | `html` \| `markdown` \| `mdx` | no | One report format per call. Default html. |
| `resultsDir` | string | no | Directory holding checkpoint manifests. Default server-managed results directory. |

## `browser_click`

Click element by snapshot ref, or by CSS selector in element.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `button` | `left` \| `right` \| `middle` | no | Mouse button. Default left. |
| `doubleClick` | boolean | no | Double-click instead. |
| `element` | string | no | CSS selector instead of ref. Use when snapshot gives no ref, such as role-less div or span. Cannot combine with ref. |
| `ref` | string | no | Snapshot ref, such as e1. |
| `targetId` | string | no | Tab id. Default first tab. |

## `browser_close`

Close tab. Inside a tab group, prefer browser_tabs with action close.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `targetId` | string | no | Tab id to close. Default first tab. |

## `browser_console_messages`

Console messages from page. Filter by minimum level.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `level` | `verbose` \| `info` \| `warning` \| `error` | no | Return only this level or above. |
| `targetId` | string | no | Tab id. Default first tab. |

## `browser_drag`

Drag from one element to another. Each side takes a snapshot ref or a CSS selector.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `endElement` | string | no | CSS selector to drop onto, instead of endRef. |
| `endRef` | string | no | Snapshot ref to drop onto. |
| `startElement` | string | no | CSS selector to drag from, instead of startRef. Drag handles are usually role-less div with no snapshot ref. |
| `startRef` | string | no | Snapshot ref to drag from. |
| `targetId` | string | no | Tab id. Default first tab. |

## `browser_drop`

Drop files or MIME data onto element, as if dragged from outside the page. Pass paths, data, or both.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `data` | object | no | MIME map: {"text/plain": "hello"} |
| `element` | string | no | CSS selector instead of ref. Drop zones are usually role-less div with no snapshot ref. Cannot combine with ref. |
| `paths` | string[] | no | Absolute file paths. Uses the file input when ref is one. |
| `ref` | string | no | Snapshot ref, such as e1. |
| `targetId` | string | no | Tab id. Default first tab. |

## `browser_evaluate`

Run JS in page via page.evaluate(). Use for elements the snapshot omits: portal div, framework overlay, shadow DOM. Can click hidden element, read data, change DOM. Cross-origin fetch fails CORS here, so use browser_run_code_unsafe with page.request.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `expression` | string | yes | JS expression or function. Example: `document.title` or `() => document.querySelector('.menu').click()`. With ref: `(el) => el.textContent`. |
| `ref` | string | no | Snapshot ref, such as e1. Expression gets element as first argument. |
| `targetId` | string | no | Tab id. Default first tab. |

## `browser_file_upload`

Set files on file input. Pass inputRef or element, not both.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `paths` | string[] | yes | Absolute file paths. |
| `element` | string | no | CSS selector of the file input, instead of inputRef. |
| `inputRef` | string | no | Snapshot ref of the file input. |
| `targetId` | string | no | Tab id. Default first tab. |

## `browser_fill_form`

Fill many form fields in one call.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `fields` | object[] | yes | Fields to fill. Each needs ref and type. |
| `targetId` | string | no | Tab id. Default first tab. |

## `browser_find`

Search accessibility snapshot for text or regex. Returns matching lines with context. Cheaper than a full snapshot when you only need to locate one element.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `regex` | string | no | Regular expression. Wrap in slashes for flags: "/error/i". |
| `targetId` | string | no | Tab id. Default first tab. |
| `text` | string | no | Case-insensitive substring. Pass text or regex, not both. |

## `browser_handle_dialog`

Accept or dismiss alert, confirm, prompt. Handles a dialog already open, otherwise arms the next dialog on this tab. To control the answer, arm before the click that opens the dialog. An unanswered dialog blocks the tab, so the server auto-dismisses it after about 3 seconds.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `accept` | boolean | yes | True accepts. False dismisses. |
| `promptText` | string | no | Text to enter in a prompt dialog. |
| `targetId` | string | no | Tab id. Default first tab. |

## `browser_hover`

Hover element by snapshot ref, or by CSS selector in element.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `element` | string | no | CSS selector instead of ref. Use when snapshot gives no ref, such as role-less div or span. Cannot combine with ref. |
| `ref` | string | no | Snapshot ref, such as e1. |
| `targetId` | string | no | Tab id. Default first tab. |

## `browser_navigate`

Navigate tab to URL.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `url` | string | yes | URL to open. |
| `targetId` | string | no | Tab id from browser_tabs. Default first tab. |

## `browser_navigate_back`

Go back in tab history, or forward.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `forward` | boolean | no | Go forward instead of back. |
| `targetId` | string | no | Tab id. Default first tab. |

## `browser_network_request`

Headers and body for one network request, by index from browser_network_requests.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `index` | integer | yes | Index from browser_network_requests. Starts at 1. |
| `filter` | string | no | Pass the same filter you used when listing, so indexes match. |
| `maxChars` | number | no | Truncate body to this many characters. Default 200000. |
| `part` | `request-headers` \| `request-body` \| `response-headers` \| `response-body` | no | Return only this part. Omit for all. |
| `targetId` | string | no | Tab id. Default first tab. |

## `browser_network_requests`

List network requests this tab made, numbered from 1. Pass that index to browser_network_request for headers and body.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `clear` | boolean | no | Clear collected requests after returning. |
| `filter` | string | no | Return only URLs containing this substring. |
| `targetId` | string | no | Tab id. Default first tab. |

## `browser_network_response_body`

Response body for URL matching pattern. Checks traffic this tab already made, then waits timeoutMs for new match. Chrome drops cached bodies after a while, and then this tool says so instead of returning empty body. Re-fetch with browser_run_code_unsafe and page.request.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `url` | string | yes | Full URL, or substring to match. Full URL is safer. |
| `maxChars` | number | no | Truncate body to this many characters. Default 200000. |
| `targetId` | string | no | Tab id. Default first tab. |
| `timeoutMs` | number | no | Wait this long for new match. Default 20000. |

## `browser_page_errors`

Uncaught JS errors from page.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `clear` | boolean | no | Clear collected errors after returning. |
| `targetId` | string | no | Tab id. Default first tab. |

## `browser_press_key`

Press keyboard key on focused element.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `key` | string | yes | Key name: Enter, Escape, ArrowDown. |
| `targetId` | string | no | Tab id. Default first tab. |

## `browser_resize`

Resize tab viewport.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `height` | number | yes | Height in pixels. |
| `width` | number | yes | Width in pixels. |
| `targetId` | string | no | Tab id. Default first tab. |

## `browser_run_code_unsafe`

Run Playwright code against one tab. Code gets the `page` object, so the whole Playwright API works: page.request, page.evaluate, page.context().cookies(), page.pdf. Use it for authenticated HTTP calls, since page.request runs Node-side and skips CORS, and to filter large responses before they reach the model. Warning: this tool runs arbitrary JavaScript inside the Playwright MCP server process, which is equivalent to remote code execution on the host machine.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `code` | string | no | JavaScript function taking page as its only argument. Example: `async (page) => { await page.getByRole('button', { name: 'Submit' }).click(); return await page.title(); }` |
| `filename` | string | no | Load code from this file. Relative path resolves against server working directory. Overrides code when both are set. |
| `targetId` | string | no | Tab id. Default first tab. |
| `timeoutMs` | number | no | Abort snippet after this many milliseconds. Default 120000. |

## `browser_screenshot`

Screenshot page or one element. Pass ref or element to capture one element. Omit both to capture the viewport. Default saves to file and returns the path, which keeps image data out of the context window.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `element` | string | no | CSS selector instead of ref. Ignored when ref is set. |
| `fullPage` | boolean | no | Capture full scrollable page instead of viewport. Default false. Not compatible with ref or element. |
| `maxWidth` | number | no | Max width in pixels. Scales down proportionally when wider. |
| `quality` | number | no | jpeg quality, 1-100. Default 80. Lower is smaller. Only applies when type is jpeg. |
| `ref` | string | no | Snapshot ref, such as e1. |
| `returnAs` | `file` \| `base64` | no | file saves to disk and returns the path, which keeps image data out of the context window. base64 returns inline image data. Default file. |
| `savePath` | string | no | File path to save to. Only used when returnAs is file. Default ~/.agentic-playwright-mcp/screenshots/ with a timestamp name. |
| `targetId` | string | no | Tab id. Default first tab. |
| `type` | `png` \| `jpeg` | no | Image format. Default png. jpeg gives smaller files. |

## `browser_select_option`

Select options in a <select> dropdown.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `ref` | string | yes | Snapshot ref, such as e1. |
| `values` | string[] | yes | Option values to select. |
| `targetId` | string | no | Tab id. Default first tab. |

## `browser_snapshot`

Accessibility tree of the page, with refs (e1, e2) for click, type, hover. Only elements with an accessible role get a ref. For role-less div or span, pass a CSS selector in element instead. Refs die after navigation or DOM change, so snapshot again.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `compact` | boolean | no | Drop unnamed structural elements and empty branches. |
| `interactive` | boolean | no | Keep only interactive elements: button, link, input. Smallest output. |
| `maxChars` | number | no | Truncate snapshot at this many characters. Try 5000 to 15000. |
| `maxDepth` | number | no | Max tree depth. 0 is root only. Try 3 to 5 on complex pages. |
| `targetId` | string | no | Tab id from browser_tabs. Default first tab. |

## `browser_tab_group`

Manage tab groups for session isolation. Actions: create, list, delete. create: returns groupId. Pass it to browser_tabs. list: MCP isolation groups and native Chrome groups with tab counts. delete: removes the group and closes its tabs, unless closeTabs is false. A group is removed automatically after its last tab closes. Prefer a human-readable group name under 20 characters. When agents share one browser, each creates its own group, so one agent never lists or closes another agent's tabs.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `action` | `create` \| `list` \| `delete` | yes | Action to perform. |
| `closeTabs` | boolean | no | Close the group's tabs on delete. Default true. |
| `color` | `grey` \| `blue` \| `red` \| `yellow` \| `green` \| `pink` \| `purple` \| `cyan` | no | Group colour in Chrome, for action create. Needs companion extension. |
| `groupId` | string | no | Group name, for action delete. |
| `name` | string | no | Group name, for action create. Prefer a human-readable name under 20 characters. |

## `browser_tabs`

Manage tabs. Actions: list, new, close, select. list: with groupId, only that MCP group's tabs. Without groupId, all tabs. When the companion extension is available, each tab also shows its native Chrome group. new: creates tab and returns its targetId. Keep that id for every later call. close, select: pass targetId or index. When more than one agent shares this browser, create a group with browser_tab_group first and pass groupId. Ungrouped tabs still work for one agent.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `action` | `list` \| `new` \| `close` \| `select` | yes | Action to perform. |
| `groupId` | string | no | Group name from browser_tab_group. Scopes this call to that group. |
| `index` | number | no | Tab index for close or select. Relative to the group when groupId is set. |
| `targetId` | string | no | Tab id for close or select, instead of index. |
| `url` | string | no | URL for action new. Default about:blank. |

## `browser_type`

Type text into element.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `ref` | string | yes | Snapshot ref, such as e1. |
| `text` | string | yes | Text to type. |
| `submit` | boolean | no | Press Enter after typing. |
| `targetId` | string | no | Tab id. Default first tab. |

## `browser_wait_for`

Wait for condition: text, selector, url, load state, or time.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `loadState` | `load` \| `domcontentloaded` \| `networkidle` | no | Wait for load state. |
| `selector` | string | no | Wait until CSS selector appears. |
| `targetId` | string | no | Tab id. Default first tab. |
| `text` | string | no | Wait until text appears. |
| `textGone` | string | no | Wait until text gone. |
| `timeMs` | number | no | Wait this many milliseconds. |
| `url` | string | no | Wait until URL matches pattern. |
