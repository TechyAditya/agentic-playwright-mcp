/**
 * Minimal MCP client over stdio, for driving the built server the way Cursor does.
 *
 * These tests exercise `dist/`, not `src/`, because several past breakages were in
 * packaging rather than logic.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "dist", "cli.js");

export type ToolResult = { text: string; isError: boolean };

type Pending = {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
};

export class McpTestClient {
  private child?: ChildProcess;
  private buffer = "";
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private stderr = "";
  private exited = false;

  /** Checkpoint artifacts land here instead of the developer's real output dir. */
  readonly checkpointDir = mkdtempSync(join(tmpdir(), "apmcp-e2e-checkpoints-"));

  async start(): Promise<void> {
    // Spawn from the home directory, the way an MCP client does. The fork once
    // failed only under that cwd, because playwright-checkpoint resolved
    // @playwright/test relative to process.cwd() — so the cwd is part of the test.
    const child = spawn(
      process.execPath,
      [CLI, "--keep-alive", "--checkpoint-output-dir", this.checkpointDir],
      { stdio: ["pipe", "pipe", "pipe"], cwd: homedir() },
    );
    this.child = child;

    child.stdout?.setEncoding("utf-8");
    child.stdout?.on("data", (chunk: string) => this.consume(chunk));
    child.stderr?.setEncoding("utf-8");
    child.stderr?.on("data", (chunk: string) => {
      this.stderr += chunk;
    });
    child.on("exit", (code) => {
      this.exited = true;
      this.failPending(new Error(`MCP server exited with code ${code}\n${this.stderrTail()}`));
    });

    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "apmcp-e2e", version: "0" },
    });
    this.notify("notifications/initialized");
  }

  async listToolNames(): Promise<string[]> {
    const result = await this.request("tools/list", {});
    const tools = (result.tools ?? []) as Array<{ name: string }>;
    return tools.map((tool) => tool.name);
  }

  /** Call a tool. Tool-level failures come back as `isError`, not exceptions. */
  async call(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
    const result = await this.request("tools/call", { name, arguments: args });
    const content = (result.content ?? []) as Array<{ text?: string }>;
    return {
      text: content.map((part) => part.text ?? "").join("\n"),
      isError: Boolean(result.isError),
    };
  }

  /** Call a tool and fail the test if it reports an error. */
  async callOk(name: string, args: Record<string, unknown> = {}): Promise<string> {
    const result = await this.call(name, args);
    if (result.isError) {
      throw new Error(`${name} failed: ${result.text}`);
    }
    return result.text;
  }

  async stop(): Promise<void> {
    if (!this.child || this.exited) {
      return;
    }
    this.child.kill();
    await new Promise((done) => setTimeout(done, 50));
  }

  stderrTail(lines = 20): string {
    return this.stderr.split(/\r?\n/).slice(-lines).join("\n");
  }

  private consume(chunk: string): void {
    this.buffer += chunk;
    let newline: number;
    while ((newline = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) {
        continue;
      }
      let message: { id?: number; error?: unknown; result?: Record<string, unknown> };
      try {
        message = JSON.parse(line);
      } catch {
        continue; // Not JSON-RPC; the server also logs to stdout on startup.
      }
      if (typeof message.id !== "number") {
        continue;
      }
      const waiter = this.pending.get(message.id);
      if (!waiter) {
        continue;
      }
      this.pending.delete(message.id);
      if (message.error) {
        waiter.reject(new Error(JSON.stringify(message.error)));
      } else {
        waiter.resolve(message.result ?? {});
      }
    }
  }

  private request(method: string, params: unknown): Promise<Record<string, unknown>> {
    const id = this.nextId++;
    return new Promise((resolvePromise, rejectPromise) => {
      this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise });
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  private notify(method: string, params?: unknown): void {
    this.send({ jsonrpc: "2.0", method, params });
  }

  private send(message: unknown): void {
    if (!this.child?.stdin) {
      throw new Error("MCP server is not running");
    }
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private failPending(error: Error): void {
    for (const waiter of this.pending.values()) {
      waiter.reject(error);
    }
    this.pending.clear();
  }
}
