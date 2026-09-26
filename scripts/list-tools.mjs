/**
 * Smoke check: spawn the built server over stdio, print the tools it exposes,
 * and call browser_checkpoint_report (the only tool that needs no browser) to
 * prove the lazy playwright-checkpoint import resolves.
 *
 * Spawns from the user's home directory on purpose: MCP clients do not run the
 * server from its own package directory, and cwd-sensitive module resolution is
 * exactly what broke this before. Chrome does not need to be running.
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, "..", "dist", "cli.js");
const spawnCwd = process.env.SMOKE_CWD || homedir();

console.log(`spawning from cwd: ${spawnCwd}`);

const child = spawn(process.execPath, [cli], {
  stdio: ["pipe", "pipe", "pipe"],
  cwd: spawnCwd,
});

let buffer = "";
const send = (msg) => child.stdin.write(JSON.stringify(msg) + "\n");

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
    if (msg.id === 1) {
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
      send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    }
    if (msg.id === 2) {
      const tools = msg.result.tools.map((t) => t.name).sort();
      console.log(`${tools.length} tools:`);
      for (const name of tools) console.log(`  ${name}`);
      send({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "browser_checkpoint_report", arguments: { format: "markdown" } },
      });
    }
    if (msg.id === 3) {
      const text = msg.result?.content?.[0]?.text ?? "";
      const failed =
        msg.result?.isError && /Cannot find module|Checkpoint support is unavailable/.test(text);
      console.log(`\nbrowser_checkpoint_report -> ${failed ? "FAILED" : "ok"}`);
      console.log(text.split("\n").slice(0, 6).join("\n"));
      child.kill();
      process.exit(failed ? 1 : 0);
    }
  }
});

child.stderr.on("data", (c) => process.stderr.write(c));

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "smoke", version: "0" },
  },
});

setTimeout(() => {
  console.error("timed out waiting for tools/list");
  child.kill();
  process.exit(1);
}, 20000);
