/**
 * Extracted from OpenClaw (https://github.com/openclaw/openclaw)
 * Original: src/browser/pw-tools-core.activity.ts
 * License: MIT
 */

import type {
  BrowserConsoleMessage,
  BrowserNetworkRequest,
  BrowserPageError,
} from "./pw-session.js";
import {
  clearStoredNetworkRequests,
  ensurePageState,
  getPageForTargetId,
  listStoredNetworkRequests,
  lookupStoredNetworkRequest,
} from "./pw-session.js";

export async function getPageErrorsViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
  clear?: boolean;
}): Promise<{ errors: BrowserPageError[] }> {
  const page = await getPageForTargetId(opts);
  const state = ensurePageState(page);
  const errors = [...state.errors];
  if (opts.clear) {
    state.errors = [];
  }
  return { errors };
}

export async function getNetworkRequestsViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
  filter?: string;
  clear?: boolean;
}): Promise<{ requests: BrowserNetworkRequest[] }> {
  const page = await getPageForTargetId(opts);
  ensurePageState(page);
  const requests = listStoredNetworkRequests(page, opts.filter);
  if (opts.clear) {
    clearStoredNetworkRequests(page);
  }
  return { requests };
}

export type NetworkRequestPart =
  | "request-headers"
  | "request-body"
  | "response-headers"
  | "response-body";

function truncate(value: string, maxChars: number): { text: string; truncated: boolean } {
  if (value.length <= maxChars) {
    return { text: value, truncated: false };
  }
  return { text: value.slice(0, maxChars), truncated: true };
}

export async function getNetworkRequestDetailsViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
  index: number;
  filter?: string;
  part?: NetworkRequestPart;
  maxChars?: number;
}): Promise<unknown> {
  const page = await getPageForTargetId(opts);
  ensurePageState(page);
  const { rec, request } = lookupStoredNetworkRequest(page, opts.index, opts.filter);
  const maxChars =
    typeof opts.maxChars === "number" && Number.isFinite(opts.maxChars)
      ? Math.max(1, Math.min(5_000_000, Math.floor(opts.maxChars)))
      : 200_000;

  const requestHeaders = request.headers();
  const requestBody = request.postData() ?? null;
  const response = await request.response();
  let responseHeaders: Record<string, string> | undefined;
  let responseBody: string | undefined;
  let bodyError: string | undefined;
  if (response) {
    responseHeaders = response.headers();
    try {
      responseBody = await response.text();
    } catch (err) {
      bodyError = err instanceof Error ? err.message : String(err);
    }
  }

  const part = opts.part;
  if (part === "request-headers") {
    return { index: opts.index, id: rec.id, headers: requestHeaders };
  }
  if (part === "request-body") {
    return { index: opts.index, id: rec.id, body: requestBody };
  }
  if (part === "response-headers") {
    return { index: opts.index, id: rec.id, headers: responseHeaders ?? {} };
  }
  if (part === "response-body") {
    const sliced = responseBody ? truncate(responseBody, maxChars) : { text: "", truncated: false };
    return {
      index: opts.index,
      id: rec.id,
      body: sliced.text,
      truncated: sliced.truncated,
      error: bodyError,
    };
  }

  const sliced = responseBody ? truncate(responseBody, maxChars) : undefined;
  return {
    index: opts.index,
    id: rec.id,
    timestamp: rec.timestamp,
    method: rec.method,
    url: rec.url,
    resourceType: rec.resourceType,
    status: rec.status ?? response?.status(),
    ok: rec.ok ?? response?.ok(),
    failureText: rec.failureText,
    requestHeaders,
    requestBody,
    responseHeaders,
    responseBody: sliced?.text,
    responseBodyTruncated: sliced?.truncated,
    responseBodyError: bodyError,
  };
}

function consolePriority(level: string) {
  switch (level) {
    case "error":
      return 3;
    case "warning":
      return 2;
    case "info":
    case "log":
      return 1;
    case "debug":
      return 0;
    default:
      return 1;
  }
}

export async function getConsoleMessagesViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
  level?: string;
}): Promise<BrowserConsoleMessage[]> {
  const page = await getPageForTargetId(opts);
  const state = ensurePageState(page);
  if (!opts.level) {
    return [...state.console];
  }
  const min = consolePriority(opts.level);
  return state.console.filter((msg) => consolePriority(msg.type) >= min);
}
