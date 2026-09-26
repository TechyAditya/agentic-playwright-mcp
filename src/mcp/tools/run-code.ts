/**
 * browser_run_code_unsafe tool - run a Playwright snippet against a specific tab
 *
 * Ported from microsoft/playwright
 * (packages/playwright-core/src/tools/backend/runCode.ts, Apache-2.0).
 *
 * Adapted for agentic-playwright-mcp:
 * - the page is resolved via getPageForTargetId so the snippet is tab-isolated
 * - upstream's ManualPromise is inlined as a local deferred
 * - upstream's response.resolveClientFilename is replaced with a cwd-relative read
 * - upstream's tab.context.onUnhandledRejection is replaced with a scoped
 *   process-level listener, preserving the fail-fast behaviour it exists for
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

import type { ServerConfig } from "../../config.js";
import type { RegisterToolFn } from "../types.js";
import { getPageForTargetId, ensurePageState } from "../../browser/pw-session.js";

class Deferred<T> {
  readonly promise: Promise<T>;
  private _resolve!: (value: T) => void;
  private _reject!: (reason: unknown) => void;
  private _done = false;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
  }

  isDone() {
    return this._done;
  }

  resolve(value: T) {
    if (this._done) return;
    this._done = true;
    this._resolve(value);
  }

  reject(reason: unknown) {
    if (this._done) return;
    this._done = true;
    this._reject(reason);
  }
}

const EXAMPLE =
  "async (page) => { await page.getByRole('button', { name: 'Submit' }).click(); return await page.title(); }";

export function registerBrowserRunCodeTool(
  register: RegisterToolFn,
  config: ServerConfig
) {
  register(
    "browser_run_code_unsafe",
    "Run Playwright code against one tab. Code gets the `page` object, so the whole Playwright " +
      "API works: page.request, page.evaluate, page.context().cookies(), page.pdf. " +
      "Use it for authenticated HTTP calls, since page.request runs Node-side and skips CORS, " +
      "and to filter large responses before they reach the model. " +
      "Warning: this tool runs arbitrary JavaScript inside the Playwright MCP server process, " +
      "which is equivalent to remote code execution on the host machine.",
    {
      type: "object",
      properties: {
        code: {
          type: "string",
          description:
            "JavaScript function taking page as its only argument. Example: `" + EXAMPLE + "`",
        },
        filename: {
          type: "string",
          description:
            "Load code from this file. Relative path resolves against server working directory. " +
            "Overrides code when both are set.",
        },
        targetId: {
          type: "string",
          description: "Tab id. Default first tab.",
        },
        timeoutMs: {
          type: "number",
          description: "Abort snippet after this many milliseconds. Default 120000.",
        },
      },
    },
    async (args: {
      code?: string;
      filename?: string;
      targetId?: string;
      timeoutMs?: number;
    }) => {
      if (!config.cdpEndpoint) throw new Error("CDP endpoint not configured");

      let code = args.code;
      if (args.filename) {
        const resolvedPath = path.resolve(process.cwd(), args.filename);
        code = await fs.promises.readFile(resolvedPath, "utf-8");
      }
      if (!code || !code.trim()) {
        throw new Error("code or filename is required");
      }

      const page = await getPageForTargetId({
        cdpUrl: config.cdpEndpoint,
        targetId: args.targetId,
      });
      ensurePageState(page);

      const end = new Deferred<string | undefined>();
      const context: Record<string, unknown> = { page, __end__: end };
      vm.createContext(context);

      // User-installed callbacks (e.g. page.route handlers) can throw
      // asynchronously while __fn__ awaits an operation that depends on them
      // (e.g. a page.evaluate awaiting a fetch the route never fulfills).
      // Settle on the first such rejection so we unblock instead of waiting
      // for the timeout.
      const onUnhandled = (reason: unknown) => {
        end.reject(reason instanceof Error ? reason : new Error(String(reason)));
      };
      process.on("unhandledRejection", onUnhandled);

      const timeoutMs = Math.max(1_000, Math.min(600_000, args.timeoutMs ?? 120_000));
      const timer = setTimeout(
        () => end.reject(new Error(`Snippet timed out after ${timeoutMs}ms`)),
        timeoutMs
      );

      try {
        // Compile the user function separately to avoid template literal escaping
        // issues when the code contains backticks.
        context.__fn__ = vm.runInContext("(" + code + ")", context);
        const snippet =
          "(async () => {\n" +
          "  try {\n" +
          "    const result = await __fn__(page);\n" +
          "    __end__.resolve(JSON.stringify(result));\n" +
          "  } catch (e) {\n" +
          "    __end__.reject(e);\n" +
          "  }\n" +
          "})()";
        const iifePromise = vm.runInContext(snippet, context) as Promise<void>;
        await Promise.race([iifePromise, end.promise]);
        const result = await end.promise;
        if (typeof result !== "string") {
          return "**Ran snippet** — returned `undefined`";
        }
        return result;
      } finally {
        clearTimeout(timer);
        process.off("unhandledRejection", onUnhandled);
      }
    }
  );
}
