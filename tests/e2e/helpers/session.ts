/**
 * One session per spec file: its own MCP server, fixture server, tab group and tab.
 *
 * Each spec gets a distinct group so the specs stay isolated in the shared Chrome —
 * the same isolation the fork exists to provide.
 */

import { McpTestClient, type ToolResult } from "./mcp-client.js";
import { startFixtureServer, type FixtureServer } from "./fixture-server.js";

export type Session = {
  client: McpTestClient;
  baseUrl: string;
  targetId: string;
  group: string;
  /** Call a tool with this session's targetId injected. */
  call: (name: string, args?: Record<string, unknown>) => Promise<ToolResult>;
  /** Same, but fails the test if the tool reports an error. */
  callOk: (name: string, args?: Record<string, unknown>) => Promise<string>;
  snapshot: () => Promise<string>;
  /** textContent of a selector, unwrapped from the browser_evaluate envelope. */
  readText: (selector: string) => Promise<string>;
  /** Evaluate an expression that returns an object, parsed. */
  evaluateJson: <T>(expression: string) => Promise<T>;
  reload: () => Promise<void>;
  dispose: () => Promise<void>;
};

export async function startSession(groupName: string): Promise<Session> {
  const fixture: FixtureServer = await startFixtureServer();
  const client = new McpTestClient();
  await client.start();

  const group = `e2e-${groupName}`;
  await client.callOk("browser_tab_group", { action: "create", name: group });
  const created = await client.callOk("browser_tabs", {
    action: "new",
    groupId: group,
    url: fixture.baseUrl,
  });
  const targetId = /[A-F0-9]{32}/.exec(created)?.[0];
  if (!targetId) {
    await client.stop();
    await fixture.close();
    throw new Error(`browser_tabs did not return a targetId: ${created}`);
  }

  const call = (name: string, args: Record<string, unknown> = {}) =>
    client.call(name, { targetId, ...args });
  const callOk = (name: string, args: Record<string, unknown> = {}) =>
    client.callOk(name, { targetId, ...args });

  const session: Session = {
    client,
    baseUrl: fixture.baseUrl,
    targetId,
    group,
    call,
    callOk,
    snapshot: () => callOk("browser_snapshot"),
    readText: async (selector: string) => {
      const output = await callOk("browser_evaluate", {
        expression: `() => document.querySelector(${JSON.stringify(selector)})?.textContent ?? ""`,
      });
      const payload = evaluatePayload(output);
      try {
        return JSON.parse(payload) as string;
      } catch {
        return payload;
      }
    },
    evaluateJson: async <T>(expression: string) => {
      const output = await callOk("browser_evaluate", { expression });
      return JSON.parse(evaluatePayload(output)) as T;
    },
    reload: async () => {
      await callOk("browser_navigate", { url: fixture.baseUrl });
    },
    dispose: async () => {
      await client
        .call("browser_tab_group", { action: "delete", groupId: group, closeTabs: true })
        .catch(() => undefined);
      await client.stop();
      await fixture.close();
    },
  };

  return session;
}

/**
 * The JSON payload out of a browser_evaluate result.
 *
 * Strings come back inline (`**Evaluated** — returned: "click:done"`), objects in a
 * fenced json block.
 */
function evaluatePayload(output: string): string {
  const fenced = /```json\s*([\s\S]*?)```/.exec(output);
  if (fenced) {
    return fenced[1].trim();
  }
  const inline = /returned:\s*([\s\S]*)$/.exec(output);
  return (inline ? inline[1] : output).trim();
}

/**
 * Find a snapshot ref by matching its line, e.g. /button "Click me"/.
 *
 * Only elements with an accessible role get a ref. For role-less elements, pass a
 * CSS selector via `element` instead of hunting for a ref.
 */
export function refFor(snapshot: string, pattern: RegExp): string {
  for (const line of snapshot.split(/\r?\n/)) {
    if (pattern.test(line)) {
      const ref = /\[ref=(e\d+)\]/.exec(line);
      if (ref) {
        return ref[1];
      }
    }
  }
  throw new Error(`No ref matching ${pattern} in snapshot:\n${snapshot}`);
}
