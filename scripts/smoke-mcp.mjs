/**
 * End-to-end smoke check against the exact command line in ~/.cursor/mcp.json.
 *
 * Reads that config, spawns the server the same way Cursor does (from the user's
 * home directory), lists tools, then exercises three of them for real:
 *   - browser_tab_group / browser_tabs  (tab isolation)
 *   - browser_run_code_unsafe            (the ported tool)
 *   - browser_console_messages           (a newly registered collector)
 *
 * Requires the managed Chrome daemon or a reachable CDP endpoint.
 */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const configPath = path.join(homedir(), ".cursor", "mcp.json");
const config = JSON.parse(readFileSync(configPath, "utf-8"));
const entry = config.mcpServers["agentic-playwright"];
if (!entry) throw new Error("no agentic-playwright entry in ~/.cursor/mcp.json");

console.log(`command: ${entry.command} ${(entry.args || []).join(" ")}`);
console.log(`cwd: ${homedir()}\n`);

const child = spawn(entry.command, entry.args || [], {
  stdio: ["pipe", "pipe", "pipe"],
  cwd: homedir(),
  shell: process.platform === "win32",
});

let buffer = "";
let nextId = 10;
const pending = new Map();

const send = (msg) => child.stdin.write(JSON.stringify(msg) + "\n");

function call(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    send({ jsonrpc: "2.0", id, method, params });
  });
}

function textOf(result) {
  return result?.content?.[0]?.text ?? "";
}

// browser_tab_group reports the group name as the groupId (the README's "g_..."
// form is not what this build emits), so parse the label rather than a shape.
function groupIdOf(result) {
  return /groupId:\s*([^\s*]+)/.exec(textOf(result))?.[1];
}

child.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  let idx;
  while ((idx = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    const waiter = pending.get(msg.id);
    if (waiter) {
      pending.delete(msg.id);
      if (msg.error) waiter.reject(new Error(JSON.stringify(msg.error)));
      else waiter.resolve(msg.result);
    }
  }
});

child.stderr.on("data", (c) => process.stderr.write(c));

const failures = [];
function check(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (detail) console.log(`      ${detail.replace(/\n/g, "\n      ")}`);
  if (!ok) failures.push(name);
}

try {
  await call("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "smoke", version: "0" },
  });
  send({ jsonrpc: "2.0", method: "notifications/initialized" });

  const { tools } = await call("tools/list", {});
  const names = tools.map((t) => t.name);
  check("tools/list", names.length >= 29, `${names.length} tools`);
  for (const required of [
    "browser_run_code_unsafe",
    "browser_evaluate",
    "browser_console_messages",
    "browser_network_requests",
    "browser_network_request",
    "browser_find",
    "browser_handle_dialog",
    "browser_drop",
    "browser_select_option",
  ]) {
    check(`exposes ${required}`, names.includes(required));
  }

  // Every tool must accept targetId, or isolation is not real.
  const noTarget = tools
    .filter((t) => !["browser_tab_group", "browser_checkpoint_report"].includes(t.name))
    .filter((t) => !t.inputSchema?.properties?.targetId);
  check("all tab tools accept targetId", noTarget.length === 0, noTarget.map((t) => t.name).join(", "));

  const group = await call("tools/call", {
    name: "browser_tab_group",
    arguments: { action: "create", name: "smoke", color: "blue" },
  });
  const groupId = groupIdOf(group);
  check("create tab group", Boolean(groupId), `groupId=${groupId}`);

  const tab = await call("tools/call", {
    name: "browser_tabs",
    arguments: { action: "new", groupId, url: "https://example.com" },
  });
  const targetId = /[A-F0-9]{32}/.exec(textOf(tab))?.[0];
  check("create tab in group", Boolean(targetId), targetId || textOf(tab));

  const run = await call("tools/call", {
    name: "browser_run_code_unsafe",
    arguments: {
      targetId,
      code: "async (page) => ({ title: await page.title(), url: page.url() })",
    },
  });
  const runText = textOf(run);
  check("run_code_unsafe returns page data", runText.includes("Example Domain"), runText.slice(0, 200));

  // The killer capability: an HTTP request issued from the page's context.
  const fetched = await call("tools/call", {
    name: "browser_run_code_unsafe",
    arguments: {
      targetId,
      code:
        "async (page) => { const r = await page.request.get('https://example.com/'); " +
        "const body = await r.text(); return { status: r.status(), lines: body.split('\\n').length }; }",
    },
  });
  const fetchText = textOf(fetched);
  check("run_code_unsafe can issue requests", fetchText.includes('"status":200'), fetchText.slice(0, 200));

  const console1 = await call("tools/call", {
    name: "browser_console_messages",
    arguments: { targetId },
  });
  check("console_messages responds", !console1.isError, textOf(console1).slice(0, 120));

  const net = await call("tools/call", {
    name: "browser_network_requests",
    arguments: { targetId },
  });
  const netText = textOf(net);
  check("network_requests responds", !net.isError && /"index":\s*1/.test(netText), netText.slice(0, 180));

  const detail = await call("tools/call", {
    name: "browser_network_request",
    arguments: { targetId, index: 1, part: "response-headers" },
  });
  const detailText = textOf(detail);
  check(
    "network_request by index",
    !detail.isError && /content-type/i.test(detailText),
    detailText.slice(0, 220),
  );

  const found = await call("tools/call", {
    name: "browser_find",
    arguments: { targetId, text: "Example Domain" },
  });
  check("browser_find locates page text", !found.isError && /Example Domain/.test(textOf(found)), textOf(found).slice(0, 160));

  // Second group must not see the first group's tab.
  const group2 = await call("tools/call", {
    name: "browser_tab_group",
    arguments: { action: "create", name: "smoke-2", color: "green" },
  });
  const groupId2 = groupIdOf(group2);
  check("create second tab group", Boolean(groupId2), `groupId=${groupId2}`);

  const tab2 = await call("tools/call", {
    name: "browser_tabs",
    arguments: { action: "new", groupId: groupId2, url: "https://example.org" },
  });
  const targetId2 = /[A-F0-9]{32}/.exec(textOf(tab2))?.[0];
  check("create tab in second group", Boolean(targetId2), targetId2 || textOf(tab2));

  const list1 = await call("tools/call", {
    name: "browser_tabs",
    arguments: { action: "list", groupId },
  });
  const list2 = await call("tools/call", {
    name: "browser_tabs",
    arguments: { action: "list", groupId: groupId2 },
  });
  check(
    "group 1 sees only its own tab",
    textOf(list1).includes(targetId) && !textOf(list1).includes(targetId2),
    textOf(list1).slice(0, 160),
  );
  check(
    "group 2 sees only its own tab",
    textOf(list2).includes(targetId2) && !textOf(list2).includes(targetId),
    textOf(list2).slice(0, 160),
  );

  // Cross-group access must be refused outright.
  const crossGroup = await call("tools/call", {
    name: "browser_tabs",
    arguments: { action: "select", groupId: groupId2, targetId },
  });
  check(
    "cross-group targetId is rejected",
    Boolean(crossGroup.isError) && /does not belong to group/.test(textOf(crossGroup)),
    textOf(crossGroup).slice(0, 160),
  );

  // run_code_unsafe must hit the tab it was given, not "the current tab".
  const routed = await call("tools/call", {
    name: "browser_run_code_unsafe",
    arguments: { targetId: targetId2, code: "async (page) => page.url()" },
  });
  check(
    "run_code_unsafe routes by targetId",
    textOf(routed).includes("example.org"),
    textOf(routed).slice(0, 160),
  );

  await call("tools/call", {
    name: "browser_tab_group",
    arguments: { action: "delete", groupId, closeTabs: true },
  });
  await call("tools/call", {
    name: "browser_tab_group",
    arguments: { action: "delete", groupId: groupId2, closeTabs: true },
  });
  console.log("\ncleaned up tab groups");
} catch (error) {
  check("unexpected error", false, error instanceof Error ? error.message : String(error));
} finally {
  child.kill();
}

console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join(", ")}` : "\nall checks passed");
process.exit(failures.length ? 1 : 0);
