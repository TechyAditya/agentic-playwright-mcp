# About visual tab groups and Chrome extensions

Tab isolation in this fork is logical. The server tracks which `targetId` belongs to which
`groupId` in `~/.agentic-playwright-mcp/tab-groups.json`, and that works on any Chrome.

Colouring those groups in Chrome's tab strip is a separate problem. Chrome exposes tab
groups through the `chrome.tabGroups` extension API, so the server ships a companion
extension in `extensions/tab-grouper`. After Chrome starts, the daemon loads the extension
with the CDP `Extensions.loadUnpacked` command. When that command fails,
`browser_tab_group` says `Visual grouping: unavailable` and keeps working. You lose the
native Chrome group data, not the isolation.

## How extension loading works

Chrome 137 removed `--load-extension` from branded builds after malware abused it. The
daemon retains that flag for older Chromium builds, but it does not rely on the flag.
The daemon first calls `Extensions.loadUnpacked` through the browser CDP session. Chrome
154 accepts this command over `--remote-debugging-port`.

The npm package includes `extensions/tab-grouper`. When the extension loads,
`browser_tab_group` lists native Chrome groups, including groups created by hand, and
`browser_tabs` shows each tab's Chrome group title.

If CDP loading fails, install the extension by hand once. It then persists in the profile:

1. Start Chrome with the server's profile:
   `chrome --user-data-dir=~/.agentic-playwright-mcp/chrome-profile`
2. Open `chrome://extensions`.
3. Turn on developer mode.
4. Choose "Load unpacked" and select `extensions/tab-grouper`.

On a corporate machine with managed Chrome, policy can block both paths. Logical grouping
continues to work there.

## Sources

- [Chrome for Testing](https://developer.chrome.com/blog/chrome-for-testing/)
- [Extension news, June 2025](https://developer.chrome.com/blog/extension-news-june-2025)
- [CDP Extensions domain](https://chromedevtools.github.io/devtools-protocol/tot/Extensions/)
