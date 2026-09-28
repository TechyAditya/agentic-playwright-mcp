/**
 * Extracted from OpenClaw (https://github.com/openclaw/openclaw)
 * Original: src/browser/pw-session.ts
 * License: MIT
 *
 * Modified for agentic-playwright-mcp:
 * - Updated import paths to use our simplified utilities
 * - Removed logging dependencies
 */

import type {
  Browser,
  BrowserContext,
  ConsoleMessage,
  Dialog,
  Page,
  Request,
  Response,
} from "playwright-core";
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { formatErrorMessage } from "../utils/errors.js";
import { getHeadersWithAuth } from "./cdp.helpers.js";
import { getChromeWebSocketUrl } from "./chrome.js";
import { STEALTH_SCRIPT } from "./stealth.js";
import { inheritGroupFromOpener } from "./tab-groups.js";

// ---------- Persistent ref store (file-based) ----------
const REFS_STORE_DIR = path.join(os.tmpdir(), "agentic-playwright-mcp-refs");
const REFS_TTL_MS = 5 * 60 * 1000; // 5 minutes

function ensureRefsDir(): void {
  try {
    if (!fs.existsSync(REFS_STORE_DIR)) {
      fs.mkdirSync(REFS_STORE_DIR, { recursive: true });
    }
  } catch {
    // best-effort
  }
}

function refsFilePath(key: string): string {
  // Sanitise key for filename
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 200);
  return path.join(REFS_STORE_DIR, `${safe}.json`);
}

function persistRefs(key: string, entry: RoleRefsCacheEntry): void {
  ensureRefsDir();
  try {
    const data = JSON.stringify({ ts: Date.now(), ...entry });
    fs.writeFileSync(refsFilePath(key), data, "utf-8");
  } catch {
    // best-effort
  }
}

function loadPersistedRefs(key: string): RoleRefsCacheEntry | null {
  try {
    const fp = refsFilePath(key);
    if (!fs.existsSync(fp)) return null;
    const raw = JSON.parse(fs.readFileSync(fp, "utf-8")) as {
      ts: number;
      refs: RoleRefs;
      frameSelector?: string;
      mode?: NonNullable<PageState["roleRefsMode"]>;
    };
    if (Date.now() - raw.ts > REFS_TTL_MS) {
      fs.unlinkSync(fp);
      return null;
    }
    return {
      refs: raw.refs,
      ...(raw.frameSelector ? { frameSelector: raw.frameSelector } : {}),
      ...(raw.mode ? { mode: raw.mode } : {}),
    };
  } catch {
    return null;
  }
}
// ---------- End persistent ref store ----------

export type BrowserConsoleMessage = {
  type: string;
  text: string;
  timestamp: string;
  location?: { url?: string; lineNumber?: number; columnNumber?: number };
};

export type BrowserPageError = {
  message: string;
  name?: string;
  stack?: string;
  timestamp: string;
};

export type BrowserNetworkRequest = {
  id: string;
  timestamp: string;
  method: string;
  url: string;
  resourceType?: string;
  status?: number;
  ok?: boolean;
  failureText?: string;
};

type SnapshotForAIResult = { full: string; incremental?: string };
type SnapshotForAIOptions = { timeout?: number; track?: string };

export type WithSnapshotForAI = {
  _snapshotForAI?: (options?: SnapshotForAIOptions) => Promise<SnapshotForAIResult>;
};

type TargetInfoResponse = {
  targetInfo?: {
    targetId?: string;
  };
};

type ConnectedBrowser = {
  browser: Browser;
  cdpUrl: string;
};

type PageState = {
  console: BrowserConsoleMessage[];
  errors: BrowserPageError[];
  requests: BrowserNetworkRequest[];
  requestIds: WeakMap<Request, string>;
  requestById: Map<string, Request>;
  pendingDialog?: Dialog;
  pendingDialogTimer?: NodeJS.Timeout;
  autoDismissedDialog?: { type: string; message: string; at: string };
  nextRequestId: number;
  armIdUpload: number;
  armIdDialog: number;
  armIdDownload: number;
  /**
   * Role-based refs from the last role snapshot (e.g. e1/e2).
   * Mode "role" refs are generated from ariaSnapshot and resolved via getByRole.
   * Mode "aria" refs are Playwright aria-ref ids and resolved via `aria-ref=...`.
   */
  roleRefs?: Record<string, { role: string; name?: string; nth?: number }>;
  roleRefsMode?: "role" | "aria";
  roleRefsFrameSelector?: string;
};

type RoleRefs = NonNullable<PageState["roleRefs"]>;
type RoleRefsCacheEntry = {
  refs: RoleRefs;
  frameSelector?: string;
  mode?: NonNullable<PageState["roleRefsMode"]>;
};

type ContextState = {
  traceActive: boolean;
};

const pageStates = new WeakMap<Page, PageState>();
const contextStates = new WeakMap<BrowserContext, ContextState>();
const observedContexts = new WeakSet<BrowserContext>();
const observedPages = new WeakSet<Page>();

// Best-effort cache to make role refs stable even if Playwright returns a different Page object
// for the same CDP target across requests.
const roleRefsByTarget = new Map<string, RoleRefsCacheEntry>();
const MAX_ROLE_REFS_CACHE = 50;
/** Prefer the Page we already drove for a targetId — URL matching is wrong when two tabs share a URL. */
const pagesByTargetId = new Map<string, Page>();

/**
 * How long an unanswered dialog is held open.
 *
 * Registering a dialog listener stops Playwright auto-dismissing, which is what
 * lets browser_handle_dialog answer a dialog that is already open. The cost is
 * that an unanswered dialog blocks every other interaction with the tab, so it
 * has to be dismissed eventually. This window is short enough to stay inside the
 * default 8s action timeout, so an unarmed click still completes.
 */
const DIALOG_AUTO_DISMISS_MS = 3000;

const MAX_CONSOLE_MESSAGES = 500;
const MAX_PAGE_ERRORS = 200;
const MAX_NETWORK_REQUESTS = 500;

let cached: ConnectedBrowser | null = null;
let connecting: Promise<ConnectedBrowser> | null = null;

function normalizeCdpUrl(raw: string) {
  return raw.replace(/\/$/, "");
}

function roleRefsKey(cdpUrl: string, targetId: string) {
  return `${normalizeCdpUrl(cdpUrl)}::${targetId}`;
}

export function rememberRoleRefsForTarget(opts: {
  cdpUrl: string;
  targetId: string;
  refs: RoleRefs;
  frameSelector?: string;
  mode?: NonNullable<PageState["roleRefsMode"]>;
}): void {
  const targetId = opts.targetId.trim();
  if (!targetId) {
    return;
  }
  const key = roleRefsKey(opts.cdpUrl, targetId);
  const entry: RoleRefsCacheEntry = {
    refs: opts.refs,
    ...(opts.frameSelector ? { frameSelector: opts.frameSelector } : {}),
    ...(opts.mode ? { mode: opts.mode } : {}),
  };
  roleRefsByTarget.set(key, entry);
  while (roleRefsByTarget.size > MAX_ROLE_REFS_CACHE) {
    const first = roleRefsByTarget.keys().next();
    if (first.done) {
      break;
    }
    roleRefsByTarget.delete(first.value);
  }
  // Persist to disk so refs survive across process restarts (mcporter CLI)
  persistRefs(key, entry);
}

export function storeRoleRefsForTarget(opts: {
  page: Page;
  cdpUrl: string;
  targetId?: string;
  refs: RoleRefs;
  frameSelector?: string;
  mode: NonNullable<PageState["roleRefsMode"]>;
}): void {
  const state = ensurePageState(opts.page);
  state.roleRefs = opts.refs;
  state.roleRefsFrameSelector = opts.frameSelector;
  state.roleRefsMode = opts.mode;
  if (!opts.targetId?.trim()) {
    return;
  }
  rememberRoleRefsForTarget({
    cdpUrl: opts.cdpUrl,
    targetId: opts.targetId,
    refs: opts.refs,
    frameSelector: opts.frameSelector,
    mode: opts.mode,
  });
}

export function restoreRoleRefsForTarget(opts: {
  cdpUrl: string;
  targetId?: string;
  page: Page;
}): void {
  const targetId = opts.targetId?.trim() || "";
  if (!targetId) {
    return;
  }
  const key = roleRefsKey(opts.cdpUrl, targetId);
  let entry = roleRefsByTarget.get(key);
  // Fall back to disk-persisted refs (survives across mcporter CLI invocations)
  if (!entry) {
    entry = loadPersistedRefs(key) ?? undefined;
    if (entry) {
      roleRefsByTarget.set(key, entry);
    }
  }
  if (!entry) {
    return;
  }
  const state = ensurePageState(opts.page);
  if (state.roleRefs) {
    return;
  }
  state.roleRefs = entry.refs;
  state.roleRefsFrameSelector = entry.frameSelector;
  state.roleRefsMode = entry.mode;
}

export function ensurePageState(page: Page): PageState {
  const existing = pageStates.get(page);
  if (existing) {
    return existing;
  }

  const state: PageState = {
    console: [],
    errors: [],
    requests: [],
    requestIds: new WeakMap(),
    requestById: new Map(),
    nextRequestId: 0,
    armIdUpload: 0,
    armIdDialog: 0,
    armIdDownload: 0,
  };
  pageStates.set(page, state);

  if (!observedPages.has(page)) {
    observedPages.add(page);
    page.on("console", (msg: ConsoleMessage) => {
      const entry: BrowserConsoleMessage = {
        type: msg.type(),
        text: msg.text(),
        timestamp: new Date().toISOString(),
        location: msg.location(),
      };
      state.console.push(entry);
      if (state.console.length > MAX_CONSOLE_MESSAGES) {
        state.console.shift();
      }
    });
    page.on("pageerror", (err: Error) => {
      state.errors.push({
        message: err?.message ? String(err.message) : String(err),
        name: err?.name ? String(err.name) : undefined,
        stack: err?.stack ? String(err.stack) : undefined,
        timestamp: new Date().toISOString(),
      });
      if (state.errors.length > MAX_PAGE_ERRORS) {
        state.errors.shift();
      }
    });
    page.on("request", (req: Request) => {
      state.nextRequestId += 1;
      const id = `r${state.nextRequestId}`;
      state.requestIds.set(req, id);
      state.requestById.set(id, req);
      state.requests.push({
        id,
        timestamp: new Date().toISOString(),
        method: req.method(),
        url: req.url(),
        resourceType: req.resourceType(),
      });
      if (state.requests.length > MAX_NETWORK_REQUESTS) {
        const dropped = state.requests.shift();
        if (dropped) {
          state.requestById.delete(dropped.id);
        }
      }
    });
    page.on("response", (resp: Response) => {
      const req = resp.request();
      const id = state.requestIds.get(req);
      if (!id) {
        return;
      }
      let rec: BrowserNetworkRequest | undefined;
      for (let i = state.requests.length - 1; i >= 0; i -= 1) {
        const candidate = state.requests[i];
        if (candidate && candidate.id === id) {
          rec = candidate;
          break;
        }
      }
      if (!rec) {
        return;
      }
      rec.status = resp.status();
      rec.ok = resp.ok();
    });
    page.on("dialog", (dialog: Dialog) => {
      state.pendingDialog = dialog;
      if (state.pendingDialogTimer) {
        clearTimeout(state.pendingDialogTimer);
      }
      const timer = setTimeout(() => {
        state.pendingDialogTimer = undefined;
        if (state.pendingDialog !== dialog) {
          return;
        }
        state.pendingDialog = undefined;
        state.autoDismissedDialog = {
          type: dialog.type(),
          message: dialog.message(),
          at: new Date().toISOString(),
        };
        void dialog.dismiss().catch(() => {
          // Already answered elsewhere.
        });
      }, DIALOG_AUTO_DISMISS_MS);
      timer.unref?.();
      state.pendingDialogTimer = timer;
    });
    page.on("requestfailed", (req: Request) => {
      const id = state.requestIds.get(req);
      if (!id) {
        return;
      }
      let rec: BrowserNetworkRequest | undefined;
      for (let i = state.requests.length - 1; i >= 0; i -= 1) {
        const candidate = state.requests[i];
        if (candidate && candidate.id === id) {
          rec = candidate;
          break;
        }
      }
      if (!rec) {
        return;
      }
      rec.failureText = req.failure()?.errorText;
      rec.ok = false;
    });
    page.on("close", () => {
      pageStates.delete(page);
      observedPages.delete(page);
    });
  }

  return state;
}

export function listStoredNetworkRequests(
  page: Page,
  filter?: string,
): BrowserNetworkRequest[] {
  const state = ensurePageState(page);
  const raw = [...state.requests];
  const needle = typeof filter === "string" ? filter.trim() : "";
  return needle ? raw.filter((r) => r.url.includes(needle)) : raw;
}

export function clearStoredNetworkRequests(page: Page): void {
  const state = ensurePageState(page);
  state.requests = [];
  state.requestIds = new WeakMap();
  state.requestById.clear();
}

export function lookupStoredNetworkRequest(
  page: Page,
  index: number,
  filter?: string,
): { rec: BrowserNetworkRequest; request: Request } {
  if (!Number.isInteger(index) || index < 1) {
    throw new Error("index must be a 1-based integer from browser_network_requests");
  }
  const listed = listStoredNetworkRequests(page, filter);
  const rec = listed[index - 1];
  if (!rec) {
    throw new Error(
      `No request at index ${index} (1-${listed.length || 0} from browser_network_requests)`,
    );
  }
  const request = ensurePageState(page).requestById.get(rec.id);
  if (!request) {
    throw new Error(
      `Request ${rec.id} is no longer available. List again with browser_network_requests.`,
    );
  }
  return { rec, request };
}

/** Already-seen requests whose url matches, newest first. */
export function findStoredRequestsByUrl(
  page: Page,
  match: (url: string) => boolean,
): Request[] {
  const state = ensurePageState(page);
  const found: Request[] = [];
  for (let i = state.requests.length - 1; i >= 0; i -= 1) {
    const rec = state.requests[i];
    if (!rec || !match(rec.url)) {
      continue;
    }
    const request = state.requestById.get(rec.id);
    if (request) {
      found.push(request);
    }
  }
  return found;
}

export function takePendingDialog(page: Page): Dialog | undefined {
  const state = ensurePageState(page);
  const dialog = state.pendingDialog;
  state.pendingDialog = undefined;
  if (state.pendingDialogTimer) {
    clearTimeout(state.pendingDialogTimer);
    state.pendingDialogTimer = undefined;
  }
  return dialog;
}

/** A dialog we had to dismiss because nothing answered it, so callers can explain the click. */
export function takeAutoDismissedDialog(
  page: Page,
): { type: string; message: string; at: string } | undefined {
  const state = ensurePageState(page);
  const dialog = state.autoDismissedDialog;
  state.autoDismissedDialog = undefined;
  return dialog;
}

const DEFAULT_DOWNLOAD_DIR = path.join(os.homedir(), ".agentic-playwright-mcp", "downloads");

/**
 * Enable downloads for a page via CDP Page.setDownloadBehavior.
 * This supplements the browser-level setting from the daemon.
 */
async function enablePageDownloads(page: Page): Promise<void> {
  try {
    const session = await page.context().newCDPSession(page);
    try {
      await session.send("Page.setDownloadBehavior" as never, {
        behavior: "allow",
        downloadPath: DEFAULT_DOWNLOAD_DIR,
      } as never);
    } finally {
      await session.detach().catch(() => {});
    }
  } catch {
    // Non-fatal: some pages (e.g., about:blank) may not support CDP sessions
  }
}

function observeContext(context: BrowserContext) {
  if (observedContexts.has(context)) {
    return;
  }
  observedContexts.add(context);
  ensureContextState(context);

  // Inject stealth script into every new page in this context
  context.addInitScript(STEALTH_SCRIPT).catch(() => {
    // Non-fatal: some contexts may not support addInitScript
  });

  for (const page of context.pages()) {
    ensurePageState(page);
    enablePageDownloads(page).catch(() => {});
  }
  context.on("page", (page) => {
    ensurePageState(page);
    enablePageDownloads(page).catch(() => {});
    inheritTabGroup(page).catch(() => {});
  });
}

/**
 * A tab a page opens for itself belongs to no group, because only
 * browser_tabs({ action: 'new' }) records membership. A group-scoped listing
 * then loses that tab, and two agents sharing this browser can each mistake
 * it for their own. Give a popup the group its opener is in.
 */
async function inheritTabGroup(page: Page): Promise<void> {
  const opener = await page.opener();
  if (!opener) {
    return;
  }
  const openerTargetId = await pageTargetId(opener);
  const targetId = openerTargetId ? await pageTargetId(page) : null;
  if (!openerTargetId || !targetId) {
    return;
  }
  inheritGroupFromOpener(cached?.cdpUrl ?? "", openerTargetId, targetId);
}

export function ensureContextState(context: BrowserContext): ContextState {
  const existing = contextStates.get(context);
  if (existing) {
    return existing;
  }
  const state: ContextState = { traceActive: false };
  contextStates.set(context, state);
  return state;
}

function observeBrowser(browser: Browser) {
  for (const context of browser.contexts()) {
    observeContext(context);
  }
}

async function connectBrowser(cdpUrl: string): Promise<ConnectedBrowser> {
  const normalized = normalizeCdpUrl(cdpUrl);
  if (cached?.cdpUrl === normalized) {
    return cached;
  }
  if (connecting) {
    return await connecting;
  }

  const connectWithRetry = async (): Promise<ConnectedBrowser> => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const timeout = 5000 + attempt * 2000;
        const wsUrl = await getChromeWebSocketUrl(normalized, timeout).catch(() => null);
        const endpoint = wsUrl ?? normalized;
        const headers = getHeadersWithAuth(endpoint);
        const browser = await chromium.connectOverCDP(endpoint, { timeout, headers });
        const connected: ConnectedBrowser = { browser, cdpUrl: normalized };
        cached = connected;
        observeBrowser(browser);
        browser.on("disconnected", () => {
          if (cached?.browser === browser) {
            cached = null;
          }
          pagesByTargetId.clear();
        });
        return connected;
      } catch (err) {
        lastErr = err;
        const delay = 250 + attempt * 250;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    if (lastErr instanceof Error) {
      throw lastErr;
    }
    const message = lastErr ? formatErrorMessage(lastErr) : "CDP connect failed";
    throw new Error(message);
  };

  connecting = connectWithRetry().finally(() => {
    connecting = null;
  });

  return await connecting;
}

async function getAllPages(browser: Browser): Promise<Page[]> {
  const contexts = browser.contexts();
  const pages = contexts.flatMap((c) => c.pages());
  return pages;
}

async function pageTargetId(page: Page): Promise<string | null> {
  const session = await page.context().newCDPSession(page);
  try {
    const info = (await session.send("Target.getTargetInfo")) as TargetInfoResponse;
    const targetId = String(info?.targetInfo?.targetId ?? "").trim();
    return targetId || null;
  } finally {
    await session.detach().catch(() => {});
  }
}

/**
 * Which page a URL identifies, when it identifies one at all.
 *
 * Returns an index only when the URL belongs to exactly one target and one
 * page. Tabs created blank all share `about:blank`, so ordering is not a
 * reliable tiebreak: picking by enumeration order hands the caller another
 * agent's tab, and every later call for that id follows it there.
 */
export function resolveTargetByUrl(
  targets: Array<{ id: string; url: string }>,
  pageUrls: string[],
  targetId: string,
): number | null {
  const target = targets.find((row) => row.id === targetId);
  if (!target) {
    return null;
  }
  const sameUrlTargets = targets.filter((row) => row.url === target.url);
  const matchingPages = pageUrls
    .map((url, index) => ({ url, index }))
    .filter((row) => row.url === target.url);
  if (sameUrlTargets.length !== 1 || matchingPages.length !== 1) {
    return null;
  }
  return matchingPages[0]!.index;
}

async function findPageByTargetId(
  browser: Browser,
  targetId: string,
  cdpUrl?: string,
): Promise<{ page: Page; verified: boolean } | null> {
  const pages = await getAllPages(browser);
  // Ask every page at once. One CDP round trip per tab, in series, is slow
  // enough on a busy browser to push a dialog past its auto-dismiss window.
  const ids = await Promise.all(pages.map((page) => pageTargetId(page).catch(() => null)));
  const match = ids.findIndex((id) => id !== null && id === targetId);
  if (match >= 0) {
    return { page: pages[match]!, verified: true };
  }
  // If CDP sessions fail (e.g., extension relay blocks Target.attachToBrowserTarget),
  // fall back to URL-based matching using the /json/list endpoint
  if (cdpUrl) {
    try {
      const baseUrl = cdpUrl
        .replace(/\/+$/, "")
        .replace(/^ws:/, "http:")
        .replace(/\/cdp$/, "");
      const listUrl = `${baseUrl}/json/list`;
      const response = await fetch(listUrl, { headers: getHeadersWithAuth(listUrl) });
      if (response.ok) {
        const targets = (await response.json()) as Array<{
          id: string;
          url: string;
          title?: string;
        }>;
        const index = resolveTargetByUrl(
          targets,
          pages.map((page) => page.url()),
          targetId,
        );
        if (index !== null) {
          return { page: pages[index]!, verified: false };
        }
      }
    } catch {
      // Ignore fetch errors and fall through to return null
    }
  }
  return null;
}

function rememberPageForTargetId(targetId: string, page: Page): void {
  const id = targetId.trim();
  if (!id || page.isClosed()) {
    return;
  }
  pagesByTargetId.set(id, page);
  page.once("close", () => {
    if (pagesByTargetId.get(id) === page) {
      pagesByTargetId.delete(id);
    }
  });
}

export async function getPageForTargetId(opts: {
  cdpUrl: string;
  targetId?: string;
}): Promise<Page> {
  const { browser } = await connectBrowser(opts.cdpUrl);
  const pages = await getAllPages(browser);
  if (!pages.length) {
    throw new Error("No pages available in the connected browser.");
  }
  const first = pages[0];
  if (!opts.targetId) {
    return first;
  }
  const cachedPage = pagesByTargetId.get(opts.targetId);
  if (cachedPage && !cachedPage.isClosed()) {
    return cachedPage;
  }
  const found = await findPageByTargetId(browser, opts.targetId, opts.cdpUrl);
  if (found) {
    // Only a CDP-confirmed page is worth remembering. Caching a URL guess
    // makes one wrong answer permanent for every later call on this id.
    if (found.verified) {
      rememberPageForTargetId(opts.targetId, found.page);
    }
    return found.page;
  }
  // Extension relays can block CDP attachment APIs (e.g. Target.attachToBrowserTarget),
  // which prevents us from resolving a page's targetId via newCDPSession(). If Playwright
  // only exposes a single Page, use it as a best-effort fallback.
  if (pages.length === 1) {
    return first;
  }
  throw new Error("tab not found");
}

export function refLocator(page: Page, ref: string) {
  const normalized = ref.startsWith("@")
    ? ref.slice(1)
    : ref.startsWith("ref=")
      ? ref.slice(4)
      : ref;

  if (/^e\d+$/.test(normalized)) {
    const state = pageStates.get(page);
    if (state?.roleRefsMode === "aria") {
      const scope = state.roleRefsFrameSelector
        ? page.frameLocator(state.roleRefsFrameSelector)
        : page;
      return scope.locator(`aria-ref=${normalized}`);
    }
    const info = state?.roleRefs?.[normalized];
    if (!info) {
      throw new Error(
        `Unknown ref "${normalized}". Run a new snapshot and use a ref from that snapshot.`,
      );
    }
    const scope = state?.roleRefsFrameSelector
      ? page.frameLocator(state.roleRefsFrameSelector)
      : page;
    const locAny = scope as unknown as {
      getByRole: (
        role: never,
        opts?: { name?: string; exact?: boolean },
      ) => ReturnType<Page["getByRole"]>;
    };
    const locator = info.name
      ? locAny.getByRole(info.role as never, { name: info.name, exact: true })
      : locAny.getByRole(info.role as never);
    return info.nth !== undefined ? locator.nth(info.nth) : locator;
  }

  return page.locator(`aria-ref=${normalized}`);
}

export async function closePlaywrightBrowserConnection(): Promise<void> {
  const cur = cached;
  cached = null;
  if (!cur) {
    return;
  }
  await cur.browser.close().catch(() => {});
}

/**
 * List all pages/tabs from the persistent Playwright connection.
 * Used for remote profiles where HTTP-based /json/list is ephemeral.
 */
export async function listPagesViaPlaywright(opts: { cdpUrl: string }): Promise<
  Array<{
    targetId: string;
    title: string;
    url: string;
    type: string;
  }>
> {
  const { browser } = await connectBrowser(opts.cdpUrl);
  const pages = await getAllPages(browser);
  const results: Array<{
    targetId: string;
    title: string;
    url: string;
    type: string;
  }> = [];

  for (const page of pages) {
    const tid = await pageTargetId(page).catch(() => null);
    if (tid) {
      results.push({
        targetId: tid,
        title: await page.title().catch(() => ""),
        url: page.url(),
        type: "page",
      });
    }
  }
  return results;
}

/**
 * Create a new page/tab using the persistent Playwright connection.
 * Used for remote profiles where HTTP-based /json/new is ephemeral.
 * Returns the new page's targetId and metadata.
 */
export async function createPageViaPlaywright(opts: { cdpUrl: string; url: string }): Promise<{
  targetId: string;
  title: string;
  url: string;
  type: string;
}> {
  const { browser } = await connectBrowser(opts.cdpUrl);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  ensureContextState(context);

  // Open in the background when we can. context.newPage() activates the tab
  // and restores a minimized Chrome window on Windows.
  const page =
    (await createBackgroundPage(context, "about:blank")) ?? (await context.newPage());
  ensurePageState(page);

  // Navigate to the URL
  const targetUrl = opts.url.trim() || "about:blank";
  if (targetUrl !== "about:blank") {
    await page.goto(targetUrl, { timeout: 30_000 }).catch(() => {
      // Navigation might fail for some URLs, but page is still created
    });
  }

  // Get the targetId for this page
  const tid = await pageTargetId(page).catch(() => null);
  if (!tid) {
    throw new Error("Failed to get targetId for new page");
  }
  rememberPageForTargetId(tid, page);

  return {
    targetId: tid,
    title: await page.title().catch(() => ""),
    url: page.url(),
    type: "page",
  };
}

/**
 * Close a page/tab by targetId using the persistent Playwright connection.
 * Used for remote profiles where HTTP-based /json/close is ephemeral.
 */
export async function closePageByTargetIdViaPlaywright(opts: {
  cdpUrl: string;
  targetId: string;
}): Promise<void> {
  const { browser } = await connectBrowser(opts.cdpUrl);
  const found = await findPageByTargetId(browser, opts.targetId, opts.cdpUrl);
  if (!found) {
    throw new Error("tab not found");
  }
  await found.page.close();
}

/**
 * Confirm a tab exists. Do not raise Chrome.
 *
 * page.bringToFront() and Page.bringToFront restore a minimized window and
 * steal the foreground app on Windows. Agents switch tabs on almost every
 * step, so that would keep popping Chrome over whatever the user is doing.
 * Later tools already address the page by targetId.
 */
export async function focusPageByTargetIdViaPlaywright(opts: {
  cdpUrl: string;
  targetId: string;
}): Promise<void> {
  const { browser } = await connectBrowser(opts.cdpUrl);
  const found = await findPageByTargetId(browser, opts.targetId, opts.cdpUrl);
  if (!found) {
    throw new Error("tab not found");
  }
}

/**
 * Create a tab without selecting it or restoring the Chrome window.
 * Target.createTarget({ background: true }) is what Chrome uses for that.
 */
async function createBackgroundPage(
  context: BrowserContext,
  url: string,
): Promise<Page | undefined> {
  const existing = context.pages().find((page) => !page.isClosed());
  if (!existing) {
    return undefined;
  }
  const session = await existing.context().newCDPSession(existing);
  const before = new Set(context.pages());
  try {
    await session.send("Target.createTarget", {
      url: url.trim() || "about:blank",
      background: true,
    });
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const created = context.pages().find((page) => !before.has(page) && !page.isClosed());
      if (created) {
        return created;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } catch {
    return undefined;
  } finally {
    await session.detach().catch(() => undefined);
  }
  return undefined;
}
