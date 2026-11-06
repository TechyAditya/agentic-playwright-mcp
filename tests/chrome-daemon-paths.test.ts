import { describe, expect, it } from "vitest";
import { chromeCandidatePaths, findChromeExecutable } from "../src/daemon/chrome-daemon.js";

const HOME = "/home/tester";

function lookupFor(existing: string[], globResults: Record<string, string[]> = {}) {
  const present = new Set(existing);
  return {
    exists: (candidate: string) => present.has(candidate),
    glob: (pattern: string) => globResults[pattern] ?? [],
  };
}

describe("Linux Chrome candidate paths", () => {
  const candidates = chromeCandidatePaths("linux", HOME);

  it("keeps the existing candidates first, in their original order", () => {
    expect(candidates.slice(0, 5)).toEqual([
      `${HOME}/.cache/puppeteer/chrome/linux-*/chrome-linux*/chrome`,
      `${HOME}/.cache/ms-playwright/chromium-*/chrome-linux/chrome`,
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/google-chrome",
    ]);
  });

  it.each([
    "/usr/bin/google-chrome-stable",
    "/opt/google/chrome/chrome",
    "/usr/bin/google-chrome-beta",
    "/opt/google/chrome-beta/chrome",
    "/snap/bin/chromium",
  ])("includes the common install location %s", (location) => {
    expect(candidates).toContain(location);
  });

  it("finds Arch's google-chrome-stable launcher when google-chrome is absent", () => {
    const found = findChromeExecutable(candidates, lookupFor(["/usr/bin/google-chrome-stable"]));

    expect(found).toBe("/usr/bin/google-chrome-stable");
  });

  it("finds the binary under /opt/google/chrome when no launcher exists", () => {
    const found = findChromeExecutable(candidates, lookupFor(["/opt/google/chrome/chrome"]));

    expect(found).toBe("/opt/google/chrome/chrome");
  });

  it("finds the Snap-installed chromium", () => {
    const found = findChromeExecutable(candidates, lookupFor(["/snap/bin/chromium"]));

    expect(found).toBe("/snap/bin/chromium");
  });

  it("keeps the existing /usr/bin/google-chrome ahead of the new locations", () => {
    const found = findChromeExecutable(
      candidates,
      lookupFor(["/usr/bin/google-chrome-stable", "/opt/google/chrome/chrome", "/usr/bin/google-chrome"]),
    );

    expect(found).toBe("/usr/bin/google-chrome");
  });

  it("returns null when no candidate exists", () => {
    expect(findChromeExecutable(candidates, lookupFor([]))).toBeNull();
  });
});

describe("findChromeExecutable", () => {
  it("resolves a glob pattern to its newest match", () => {
    const pattern = `${HOME}/.cache/puppeteer/chrome/linux-*/chrome-linux*/chrome`;
    const found = findChromeExecutable(
      [pattern],
      lookupFor(
        [`${HOME}/.cache/puppeteer/chrome/linux-126/chrome-linux64/chrome`, `${HOME}/.cache/puppeteer/chrome/linux-131/chrome-linux64/chrome`],
        {
          [pattern]: [
            `${HOME}/.cache/puppeteer/chrome/linux-126/chrome-linux64/chrome`,
            `${HOME}/.cache/puppeteer/chrome/linux-131/chrome-linux64/chrome`,
          ],
        },
      ),
    );

    expect(found).toBe(`${HOME}/.cache/puppeteer/chrome/linux-131/chrome-linux64/chrome`);
  });

  it("skips a glob pattern with no matches and moves on", () => {
    const found = findChromeExecutable(
      [`${HOME}/.cache/ms-playwright/chromium-*/chrome-linux/chrome`, "/usr/bin/google-chrome-stable"],
      lookupFor(["/usr/bin/google-chrome-stable"]),
    );

    expect(found).toBe("/usr/bin/google-chrome-stable");
  });
});
