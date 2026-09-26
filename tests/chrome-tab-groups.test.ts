import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeExtensionId } from "../src/browser/chrome-tab-groups.js";

const tempDirs: string[] = [];

afterAll(() => {
  for (const directory of tempDirs) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("companion extension ID", () => {
  it("uses the manifest key instead of the installation path", () => {
    const sourceManifest = JSON.parse(
      readFileSync(join(process.cwd(), "extensions", "tab-grouper", "manifest.json"), "utf-8"),
    );
    const first = mkdtempSync(join(tmpdir(), "apmcp-extension-a-"));
    const second = mkdtempSync(join(tmpdir(), "apmcp-extension-b-"));
    tempDirs.push(first, second);
    writeFileSync(join(first, "manifest.json"), JSON.stringify(sourceManifest), "utf-8");
    writeFileSync(join(second, "manifest.json"), JSON.stringify(sourceManifest), "utf-8");

    const firstId = computeExtensionId(first);
    const secondId = computeExtensionId(second);

    expect(firstId).toMatch(/^[a-p]{32}$/);
    expect(secondId).toBe(firstId);
  });
});
