# How to share one browser between agents

Use this guide when two or more agents, or an agent and a person, work in the same Chrome
window. It assumes the server already runs. To install it, read the
[README](../README.md).

## Claim a tab and keep it

1. Create a group. Name it after your session.

   ```json
   { "tool": "browser_tab_group", "action": "create", "name": "review", "color": "cyan" }
   ```

2. Open a tab in that group. Read `targetId` from the result.

   ```json
   { "tool": "browser_tabs", "action": "new", "groupId": "review", "url": "https://example.com" }
   ```

3. Pass that `targetId` to every later call.

If you skip step 3, the server uses the first tab it finds. Two agents then drive one page.
Nothing warns you. Every call succeeds against the wrong page.

A group hides your tabs from other agents. `browser_tabs` with `action: "list"` and your
`groupId` returns only your tabs, and the server rejects a `targetId` from another group.
The server removes the group after its last tab closes. A new empty group remains available
for 60 seconds so the next call can create its first tab.

The bundled extension loads through CDP when Chrome starts. When it is available,
`browser_tab_group` also lists native Chrome groups that a person created, and
`browser_tabs` labels their tabs. These native labels do not change MCP ownership.

A tab the page opens for itself joins the group its opener is in. A product link with
`target="_blank"` therefore stays yours, and it appears in your group's listing without
another call. Read the listing again after a click that can open a tab, and use the new
`targetId` from then on: the tab you clicked in never changes.

For a single agent on one tab, skip the group and keep the `targetId`.

## Hand a tab back and forth with a person

The browser is headed, so a person can finish a login the agent cannot.

1. Navigate to the host. Keep the `targetId`.
2. Ask the person to complete single sign-on in that tab.
3. Snapshot the same `targetId` when they are done.

Do not open a second tab to check the result. A new tab has a new `targetId` and no page
state. While you drive the tab, ask the person to stay out of it.

## Click something the snapshot cannot see

`browser_snapshot` gives a `ref` only to elements with an accessible role. Drag handles,
drop zones, and a `div` acting as a button have no role and no `ref`.

Pass `element` with a CSS selector instead:

```json
{ "tool": "browser_click", "element": "#submit", "targetId": "AB12..." }
```

`browser_click`, `browser_hover`, `browser_drop`, `browser_screenshot`, and
`browser_file_upload` all take `element`. `browser_drag` takes `startElement` and
`endElement`. For the exact parameters, read the [tool reference](tools.md).

Refs expire. Snapshot again after a navigation or a large DOM change.

## Call an HTTP API as the logged-in user

The page's own `fetch` obeys CORS, so a cross-origin call from `browser_evaluate` fails.
Use `browser_run_code_unsafe`, which runs on the Node side with the tab's cookies:

```json
{
  "tool": "browser_run_code_unsafe",
  "targetId": "AB12...",
  "code": "async (page) => { const r = await page.request.get('https://host/api/thing'); return { status: r.status(), body: (await r.text()).slice(0, 2000) }; }"
}
```

Filter the body inside the code. A single response can run to hundreds of megabytes, and
all of it lands in the model's context if you return it whole.

## Answer a dialog

An `alert`, `confirm`, or `prompt` blocks the tab until something answers it.

To control the answer, arm the handler before the click that opens the dialog:

```json
{ "tool": "browser_handle_dialog", "accept": true, "targetId": "AB12..." }
```

Then click. If nothing answers the dialog, the server dismisses it after about three
seconds, and the next `browser_handle_dialog` call reports what it dismissed.

## Read traffic the page already made

`browser_network_requests` lists this tab's requests, numbered from 1. Pass an index to
`browser_network_request` for that request's headers or body. To catch a response that has
not arrived yet, use `browser_network_response_body`. It matches the recorded requests
first, then waits `timeoutMs` for a new match.

Chrome drops response bodies from its cache after a while. When that happens, the tool
says so and names the URL. Re-fetch it with `browser_run_code_unsafe` and `page.request`.

Match on a full URL where you can. A pattern is a substring match, so
`http://host/` also matches `http://host/data.json`.

## Recover Chrome without killing the session

If every tool starts failing with a `connectOverCDP` timeout, one page has blocked the
browser. The CDP HTTP endpoint usually still answers.

1. List the pages: `GET http://localhost:9223/json/list`.
2. Find the offending page by URL or title.
3. Close that one page: `GET http://localhost:9223/json/close/<id>`.

Do not kill the Chrome process. That drops every authenticated tab, including the ones a
person is using.
