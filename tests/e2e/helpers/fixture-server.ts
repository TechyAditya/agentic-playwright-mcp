/**
 * Serves the fixture page over HTTP so the network, form, dialog, upload and
 * drag/drop paths all behave as they do on a real site. file:// would restrict
 * several of them.
 */

import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

export const SECOND_PAGE_MARKER = "second-page-marker";

export type FixtureServer = {
  baseUrl: string;
  close: () => Promise<void>;
};

export async function startFixtureServer(): Promise<FixtureServer> {
  const page = readFileSync(join(fixturesDir, "page.html"), "utf-8");
  const secondPage = `<!doctype html><html><head><title>Second Page</title></head>
<body><h1>Second Page</h1><p>${SECOND_PAGE_MARKER}</p></body></html>`;

  const server: Server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    if (path === "/data.json") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, items: [1, 2, 3] }));
      return;
    }
    if (path === "/second.html") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(secondPage);
      return;
    }
    if (path === "/") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(page);
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });

  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((done) => {
        // Chrome holds keep-alive sockets open, and server.close() waits for them.
        // Without this the afterAll hook stalls for seconds on every spec.
        server.closeAllConnections();
        server.close(() => done());
      }),
  };
}
