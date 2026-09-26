/**
 * Extracted from OpenClaw (https://github.com/openclaw/openclaw)
 * Original: src/browser/pw-tools-core.snapshot.ts
 * License: MIT
 */

import { type AriaSnapshotNode, formatAriaSnapshot, type RawAXNode } from "./cdp.js";
import {
  buildRoleSnapshotFromAiSnapshot,
  buildRoleSnapshotFromAriaSnapshot,
  getRoleSnapshotStats,
  type RoleSnapshotOptions,
  type RoleRefMap,
} from "./pw-role-snapshot.js";
import {
  ensurePageState,
  getPageForTargetId,
  storeRoleRefsForTarget,
  type WithSnapshotForAI,
} from "./pw-session.js";

export async function snapshotAriaViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
  limit?: number;
}): Promise<{ nodes: AriaSnapshotNode[] }> {
  const limit = Math.max(1, Math.min(2000, Math.floor(opts.limit ?? 500)));
  const page = await getPageForTargetId({
    cdpUrl: opts.cdpUrl,
    targetId: opts.targetId,
  });
  ensurePageState(page);
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Accessibility.enable").catch(() => {});
    const res = (await session.send("Accessibility.getFullAXTree")) as {
      nodes?: RawAXNode[];
    };
    const nodes = Array.isArray(res?.nodes) ? res.nodes : [];
    return { nodes: formatAriaSnapshot(nodes, limit) };
  } finally {
    await session.detach().catch(() => {});
  }
}

export async function snapshotAiViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
  timeoutMs?: number;
  maxChars?: number;
}): Promise<{ snapshot: string; truncated?: boolean; refs: RoleRefMap }> {
  const page = await getPageForTargetId({
    cdpUrl: opts.cdpUrl,
    targetId: opts.targetId,
  });
  ensurePageState(page);

  const maybe = page as unknown as WithSnapshotForAI;
  if (!maybe._snapshotForAI) {
    throw new Error("Playwright _snapshotForAI is not available. Upgrade playwright-core.");
  }

  const result = await maybe._snapshotForAI({
    timeout: Math.max(500, Math.min(60_000, Math.floor(opts.timeoutMs ?? 5000))),
    track: "response",
  });
  let snapshot = String(result?.full ?? "");
  const maxChars = opts.maxChars;
  const limit =
    typeof maxChars === "number" && Number.isFinite(maxChars) && maxChars > 0
      ? Math.floor(maxChars)
      : undefined;
  let truncated = false;
  if (limit && snapshot.length > limit) {
    snapshot = `${snapshot.slice(0, limit)}

[...TRUNCATED - page too large]`;
    truncated = true;
  }

  const built = buildRoleSnapshotFromAiSnapshot(snapshot);
  storeRoleRefsForTarget({
    page,
    cdpUrl: opts.cdpUrl,
    targetId: opts.targetId,
    refs: built.refs,
    mode: "aria",
  });
  return truncated ? { snapshot, truncated, refs: built.refs } : { snapshot, refs: built.refs };
}

export async function snapshotRoleViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
  selector?: string;
  frameSelector?: string;
  refsMode?: "role" | "aria";
  options?: RoleSnapshotOptions;
}): Promise<{
  snapshot: string;
  refs: Record<string, { role: string; name?: string; nth?: number }>;
  stats: { lines: number; chars: number; refs: number; interactive: number };
}> {
  const page = await getPageForTargetId({
    cdpUrl: opts.cdpUrl,
    targetId: opts.targetId,
  });
  ensurePageState(page);

  if (opts.refsMode === "aria") {
    if (opts.selector?.trim() || opts.frameSelector?.trim()) {
      throw new Error("refs=aria does not support selector/frame snapshots yet.");
    }
    const maybe = page as unknown as WithSnapshotForAI;
    if (!maybe._snapshotForAI) {
      throw new Error("refs=aria requires Playwright _snapshotForAI support.");
    }
    const result = await maybe._snapshotForAI({
      timeout: 5000,
      track: "response",
    });
    const built = buildRoleSnapshotFromAiSnapshot(String(result?.full ?? ""), opts.options);
    storeRoleRefsForTarget({
      page,
      cdpUrl: opts.cdpUrl,
      targetId: opts.targetId,
      refs: built.refs,
      mode: "aria",
    });
    return {
      snapshot: built.snapshot,
      refs: built.refs,
      stats: getRoleSnapshotStats(built.snapshot, built.refs),
    };
  }

  const frameSelector = opts.frameSelector?.trim() || "";
  const selector = opts.selector?.trim() || "";
  const locator = frameSelector
    ? selector
      ? page.frameLocator(frameSelector).locator(selector)
      : page.frameLocator(frameSelector).locator(":root")
    : selector
      ? page.locator(selector)
      : page.locator(":root");

  const ariaSnapshot = await locator.ariaSnapshot();
  const built = buildRoleSnapshotFromAriaSnapshot(String(ariaSnapshot ?? ""), opts.options);
  storeRoleRefsForTarget({
    page,
    cdpUrl: opts.cdpUrl,
    targetId: opts.targetId,
    refs: built.refs,
    frameSelector: frameSelector || undefined,
    mode: "role",
  });
  return {
    snapshot: built.snapshot,
    refs: built.refs,
    stats: getRoleSnapshotStats(built.snapshot, built.refs),
  };
}

export async function navigateViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
  url: string;
  timeoutMs?: number;
}): Promise<{ url: string }> {
  const url = String(opts.url ?? "").trim();
  if (!url) {
    throw new Error("url is required");
  }
  const page = await getPageForTargetId(opts);
  ensurePageState(page);
  await page.goto(url, {
    timeout: Math.max(1000, Math.min(120_000, opts.timeoutMs ?? 20_000)),
  });
  return { url: page.url() };
}

export async function navigateHistoryViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
  direction: "back" | "forward";
  timeoutMs?: number;
}): Promise<{ url: string }> {
  const page = await getPageForTargetId(opts);
  ensurePageState(page);
  const timeout = Math.max(1000, Math.min(120_000, opts.timeoutMs ?? 20_000));
  const before = page.url();
  // Chromium often restores history from bfcache. Playwright then returns
  // null even though the URL changed — treat a URL change as success.
  // waitUntil "commit" avoids the domcontentloaded hang we saw on example.com.
  const nav =
    opts.direction === "forward"
      ? await page.goForward({ timeout, waitUntil: "commit" })
      : await page.goBack({ timeout, waitUntil: "commit" });
  // A bfcache restore never fires domcontentloaded again, so this wait always burns
  // its whole budget on a restored page — keep the budget small.
  await page
    .waitForLoadState("domcontentloaded", { timeout: Math.min(timeout, 2000) })
    .catch(() => {});
  const after = page.url();
  if (nav === null && after === before) {
    throw new Error(
      `No ${opts.direction} history entry for this tab (url is still ${after})`,
    );
  }
  return { url: after };
}

export async function resizeViewportViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
  width: number;
  height: number;
}): Promise<void> {
  const page = await getPageForTargetId(opts);
  ensurePageState(page);
  await page.setViewportSize({
    width: Math.max(1, Math.floor(opts.width)),
    height: Math.max(1, Math.floor(opts.height)),
  });
}

export async function closePageViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
}): Promise<void> {
  const page = await getPageForTargetId(opts);
  ensurePageState(page);
  await page.close();
}

export async function pdfViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
}): Promise<{ buffer: Buffer }> {
  const page = await getPageForTargetId(opts);
  ensurePageState(page);
  const buffer = await page.pdf({ printBackground: true });
  return { buffer };
}

export type SnapshotFindHit = {
  line: number;
  path: string;
  snippet: string;
};

function parseFindRegex(raw: string): RegExp {
  const trimmed = raw.trim();
  const wrapped = /^\/(.+)\/([a-z]*)$/s.exec(trimmed);
  if (wrapped) {
    return new RegExp(wrapped[1], wrapped[2]);
  }
  return new RegExp(trimmed);
}

export async function findInSnapshotViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
  text?: string;
  regex?: string;
  contextLines?: number;
}): Promise<{ hits: SnapshotFindHit[]; snapshotLines: number }> {
  const text = opts.text?.trim();
  const regex = opts.regex?.trim();
  if (Boolean(text) === Boolean(regex)) {
    throw new Error("Provide either text or regex, not both");
  }
  const { snapshot } = await snapshotRoleViaPlaywright({
    cdpUrl: opts.cdpUrl,
    targetId: opts.targetId,
  });
  const lines = snapshot.split(/\r?\n/);
  const matcher = text
    ? (line: string) => line.toLowerCase().includes(text.toLowerCase())
    : (() => {
        const re = parseFindRegex(regex ?? "");
        return (line: string) => re.test(line);
      })();
  const context = Math.max(0, Math.min(8, opts.contextLines ?? 2));
  const hits: SnapshotFindHit[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (!matcher(line)) {
      continue;
    }
    const start = Math.max(0, i - context);
    const end = Math.min(lines.length, i + context + 1);
    hits.push({
      line: i + 1,
      path: line.trim(),
      snippet: lines.slice(start, end).join("\n"),
    });
    if (hits.length >= 50) {
      break;
    }
  }
  return { hits, snapshotLines: lines.length };
}
