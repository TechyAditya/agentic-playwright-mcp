# About visual tab groups and Chrome extensions

Tab isolation in this fork is logical. The server tracks which `targetId` belongs to which
`groupId` in `~/.agentic-playwright-mcp/tab-groups.json`, and that works on any Chrome.

Colouring those groups in Chrome's tab strip is a separate problem. Chrome exposes tab
groups only through the `chrome.tabGroups` extension API, never through CDP, so the server
ships a companion extension in `extensions/tab-grouper`. When the extension does not load,
`browser_tab_group` says `Visual grouping: unavailable` and keeps working. You lose the
colours, not the isolation.

## Why the extension often fails to load

Chrome 137 removed `--load-extension` from branded builds after malware abused it. The
flag is now ignored in silence. An error would at least be diagnosable.

Two CDP paths look like alternatives and are not:

- `Extensions.loadUnpacked` needs `--remote-debugging-pipe`. Playwright connects over a
  WebSocket, which needs `--remote-debugging-port`. The two flags cannot be combined.
- Passing both flags makes Chrome exit with code 13 and no message.

On a branded Chrome 137 or newer, the daemon cannot load the extension for you.

## What works instead

Chrome for Testing still honours `--load-extension`, and the daemon prefers it when it
finds one. Install it with:

```bash
npx @puppeteer/browsers install chrome@stable
```

The daemon looks in the puppeteer cache, then the Playwright cache, then the system install
locations, and falls back to branded Chrome. To point it at a specific binary, pass
`--chrome-executable`, described in the [CLI reference](cli.md).

The other option is to install the extension by hand once. It then persists in the profile
on any Chrome version:

1. Start Chrome with the server's profile:
   `chrome --user-data-dir=~/.agentic-playwright-mcp/chrome-profile`
2. Open `chrome://extensions`.
3. Turn on developer mode.
4. Choose "Load unpacked" and select `extensions/tab-grouper`.

On a corporate machine with managed Chrome, expect neither path to work. Logical grouping
is the answer there, and a person watching the run can tell tabs apart by title or URL.

## Sources

- [Chrome for Testing](https://developer.chrome.com/blog/chrome-for-testing/)
- [Extension news, June 2025](https://developer.chrome.com/blog/extension-news-june-2025)
- [CDP Extensions domain](https://chromedevtools.github.io/devtools-protocol/tot/Extensions/)
