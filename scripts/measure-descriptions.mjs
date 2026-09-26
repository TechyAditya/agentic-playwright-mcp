/** Throwaway: sum characters of every tool + parameter description. */
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const child = spawn(process.execPath, [join(root, "dist", "cli.js")], {
  stdio: ["pipe", "pipe", "pipe"],
  cwd: homedir(),
});

let buffer = "";
let nextId = 1;
const pending = new Map();
child.stdout.setEncoding("utf-8");
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    const waiter = pending.get(message.id);
    if (!waiter) continue;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
    else waiter.resolve(message.result);
  }
});
child.stderr.on("data", () => {});

function rpc(method, params) {
  const id = nextId++;
  return new Promise((res, rej) => {
    pending.set(id, { resolve: res, reject: rej });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
}

try {
  await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "measure", version: "0" },
  });
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);

  const { tools } = await rpc("tools/list", {});
  let toolChars = 0;
  let paramChars = 0;
  let paramCount = 0;
  const perTool = [];

  for (const tool of tools) {
    const t = (tool.description ?? "").length;
    let p = 0;
    for (const prop of Object.values(tool.inputSchema?.properties ?? {})) {
      const len = (prop.description ?? "").length;
      p += len;
      if (len) paramCount += 1;
    }
    toolChars += t;
    paramChars += p;
    perTool.push({ name: tool.name, tool: t, params: p, total: t + p });
  }

  perTool.sort((a, b) => b.total - a.total);
  for (const row of perTool) {
    console.log(`${String(row.total).padStart(5)}  ${row.name} (tool ${row.tool}, params ${row.params})`);
  }
  console.log("---");
  console.log(`tools: ${tools.length}`);
  console.log(`described params: ${paramCount}`);
  console.log(`tool description chars: ${toolChars}`);
  console.log(`param description chars: ${paramChars}`);
  console.log(`TOTAL description chars: ${toolChars + paramChars}`);
} finally {
  child.kill();
}
