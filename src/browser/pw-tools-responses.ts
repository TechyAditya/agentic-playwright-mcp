/**
 * Extracted from OpenClaw (https://github.com/openclaw/openclaw)
 * Original: src/browser/pw-tools-core.responses.ts
 * License: MIT
 */

import {
  ensurePageState,
  findStoredRequestsByUrl,
  getPageForTargetId,
} from "./pw-session.js";
import { normalizeTimeoutMs } from "./pw-tools-shared.js";

function matchUrlPattern(pattern: string, url: string): boolean {
  const p = pattern.trim();
  if (!p) {
    return false;
  }
  if (p === url) {
    return true;
  }
  if (p.includes("*")) {
    // eslint-disable-next-line no-useless-escape
    const escaped = p.replace(/[|\{}()[\]^$+?.]/g, "\$&");
    const regex = new RegExp(`^${escaped.replace(/\*\*/g, ".*").replace(/\*/g, ".*")}$`);
    return regex.test(url);
  }
  return url.includes(p);
}

export async function responseBodyViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
  url: string;
  timeoutMs?: number;
  maxChars?: number;
}): Promise<{
  url: string;
  status?: number;
  headers?: Record<string, string>;
  body: string;
  truncated?: boolean;
}> {
  const pattern = String(opts.url ?? "").trim();
  if (!pattern) {
    throw new Error("url is required");
  }
  const maxChars =
    typeof opts.maxChars === "number" && Number.isFinite(opts.maxChars)
      ? Math.max(1, Math.min(5_000_000, Math.floor(opts.maxChars)))
      : 200_000;
  const timeout = normalizeTimeoutMs(opts.timeoutMs, 20_000);

  const page = await getPageForTargetId(opts);
  ensurePageState(page);

  // Most matches are for traffic that already happened (page load, a click a few
  // steps back). Check the tracked requests before waiting for a future one,
  // otherwise every historical lookup burns the full timeout and then fails.
  const tracked = findStoredRequestsByUrl(page, (u) => matchUrlPattern(pattern, u));
  // Newest first, except that an exact url match beats a substring one — otherwise
  // asking for "http://host/" returns whichever subresource loaded last.
  const candidates = [
    ...tracked.filter((r) => r.url() === pattern),
    ...tracked.filter((r) => r.url() !== pattern),
  ];
  let evicted: { url: string; status?: number } | undefined;
  for (const request of candidates) {
    const existing = await request.response().catch(() => null);
    if (!existing) {
      continue;
    }
    let described: Awaited<ReturnType<typeof describeResponse>> | undefined;
    try {
      described = await describeResponse(existing, maxChars);
    } catch {
      evicted = { url: request.url(), status: existing.status() };
      continue;
    }
    if (bodyLooksEvicted(described)) {
      evicted = { url: described.url, status: described.status };
      continue;
    }
    return described;
  }

  // A tracked match whose body Chrome has dropped will never come back on its own,
  // so say so instead of returning an empty body or burning the timeout.
  if (evicted) {
    throw new Error(
      `Matched ${evicted.url} (status ${evicted.status ?? "?"}) but Chrome no longer holds its ` +
        `body — it was evicted from the network cache. Re-fetch it with browser_run_code_unsafe: ` +
        `async (page) => (await page.request.get(${JSON.stringify(evicted.url)})).text()`,
    );
  }

  const promise = new Promise<unknown>((resolve, reject) => {
    let done = false;
    let timer: NodeJS.Timeout | undefined;
    let handler: ((resp: unknown) => void) | undefined;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = undefined;
      if (handler) {
        page.off("response", handler as never);
      }
    };

    handler = (resp: unknown) => {
      if (done) {
        return;
      }
      const r = resp as { url?: () => string };
      const u = r.url?.() || "";
      if (!matchUrlPattern(pattern, u)) {
        return;
      }
      done = true;
      cleanup();
      resolve(resp);
    };

    page.on("response", handler as never);
    timer = setTimeout(() => {
      if (done) {
        return;
      }
      done = true;
      cleanup();
      reject(
        new Error(
          `Response not found for url pattern "${pattern}". Call browser_network_requests to see what this tab actually requested.`,
        ),
      );
    }, timeout);
  });

  return describeResponse(await promise, maxChars);
}

/** Chrome hands back an empty body for a response it has already dropped. */
function bodyLooksEvicted(described: {
  status?: number;
  headers?: Record<string, string>;
  body: string;
}): boolean {
  if (described.body.length > 0) {
    return false;
  }
  if (described.status === 204 || described.status === 304) {
    return false;
  }
  return described.headers?.["content-length"] !== "0";
}

async function describeResponse(
  response: unknown,
  maxChars: number,
): Promise<{
  url: string;
  status?: number;
  headers?: Record<string, string>;
  body: string;
  truncated?: boolean;
}> {
  const resp = response as {
    url?: () => string;
    status?: () => number;
    headers?: () => Record<string, string>;
    body?: () => Promise<Buffer>;
    text?: () => Promise<string>;
  };

  const url = resp.url?.() || "";
  const status = resp.status?.();
  const headers = resp.headers?.();

  let bodyText = "";
  try {
    if (typeof resp.text === "function") {
      bodyText = await resp.text();
    } else if (typeof resp.body === "function") {
      const buf = await resp.body();
      bodyText = new TextDecoder("utf-8").decode(buf);
    }
  } catch (err) {
    throw new Error(`Failed to read response body for "${url}": ${String(err)}`, { cause: err });
  }

  const trimmed = bodyText.length > maxChars ? bodyText.slice(0, maxChars) : bodyText;
  return {
    url,
    status,
    headers,
    body: trimmed,
    truncated: bodyText.length > maxChars ? true : undefined,
  };
}
