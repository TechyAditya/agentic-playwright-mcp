/**
 * Write docs/tools.md from the tool schemas the built server registers.
 *
 * Generated rather than hand-written so the reference cannot drift from the code.
 * Run with: npm run docs:tools
 */

import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "dist", "cli.js");
const outPath = join(root, "docs", "tools.md");

const child = spawn(process.execPath, [cli], {
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
  return new Promise((resolvePromise, rejectPromise) => {
    pending.set(id, { resolve: resolvePromise, reject: rejectPromise });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
}

function typeOf(schema) {
  if (!schema) return "";
  if (Array.isArray(schema.enum)) {
    return schema.enum.map((value) => `\`${value}\``).join(" \\| ");
  }
  if (schema.type === "array") {
    const item = schema.items?.type ?? "any";
    return `${item}[]`;
  }
  return schema.type ?? "object";
}

/** Escape a schema description for a markdown table cell. */
function cell(text) {
  return String(text ?? "")
    .replace(/\r?\n+/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

try {
  await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "gen-tools-doc", version: "0" },
  });
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);

  const { tools } = await rpc("tools/list", {});
  tools.sort((a, b) => a.name.localeCompare(b.name));

  const lines = [
    "# Tool reference",
    "",
    `Every tool this server registers. ${tools.length} tools.`,
    "",
    "This file is generated from the tool schemas. To regenerate it, run `npm run docs:tools`.",
    "",
    "Pass `targetId` on every tool that accepts one. Without it, the server falls back to the",
    "first available tab, which is how two agents end up on the same page. To learn how the",
    "isolation works, read [how to share one browser](shared-browser.md).",
    "",
  ];

  for (const tool of tools) {
    const schema = tool.inputSchema ?? {};
    const properties = schema.properties ?? {};
    const required = new Set(schema.required ?? []);
    const names = Object.keys(properties).sort((a, b) => {
      if (required.has(a) !== required.has(b)) return required.has(a) ? -1 : 1;
      return a.localeCompare(b);
    });

    lines.push(`## \`${tool.name}\``, "", cell(tool.description), "");

    if (names.length === 0) {
      lines.push("Takes no parameters.", "");
      continue;
    }

    lines.push("| Parameter | Type | Required | Description |", "| --- | --- | --- | --- |");
    for (const name of names) {
      const property = properties[name];
      lines.push(
        `| \`${name}\` | ${typeOf(property)} | ${required.has(name) ? "yes" : "no"} | ${cell(property.description)} |`,
      );
    }
    lines.push("");
  }

  writeFileSync(outPath, `${lines.join("\n").replace(/\n+$/, "")}\n`, "utf-8");
  console.log(`wrote ${outPath} (${tools.length} tools)`);
} finally {
  child.kill();
}
