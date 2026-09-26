import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { startSession, type Session } from "./helpers/session.js";

/** browser_file_upload, browser_drop, browser_drag */
describe("file upload, drop and drag", () => {
  let session: Session;
  let uploadPath: string;

  beforeAll(async () => {
    session = await startSession("files");
    uploadPath = join(mkdtempSync(join(tmpdir(), "apmcp-e2e-upload-")), "upload-fixture.txt");
    writeFileSync(uploadPath, "upload fixture contents\n", "utf-8");
  });

  afterAll(async () => {
    await session?.dispose();
  });

  it("sets files on a file input by CSS selector", async () => {
    await session.callOk("browser_file_upload", {
      element: "#file-input",
      paths: [uploadPath],
    });
    expect(await session.readText("#file-result")).toBe(`file:${basename(uploadPath)}`);
  });

  it("drops MIME-typed data onto a role-less drop zone", async () => {
    await session.callOk("browser_drop", {
      element: "#dropzone",
      data: { "text/plain": "dropped-payload" },
    });
    expect(await session.readText("#drop-result")).toBe("drop:dropped-payload");
  });

  it("requires paths or data to drop", async () => {
    const result = await session.call("browser_drop", { element: "#dropzone" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("paths or data is required");
  });

  it("drags between two role-less elements", async () => {
    await session.callOk("browser_drag", {
      startElement: "#dragsource",
      endElement: "#dragtarget",
    });
    expect(await session.readText("#drag-result")).toBe("drag:dragged-payload");
  });
});
