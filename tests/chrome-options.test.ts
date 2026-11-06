import { afterEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import {
  addChromeOptions,
  chromeConfigFromOptions,
  parseChromeExtensions,
} from "../src/chrome-options.js";

function parseWith(args: string[]) {
  const command = addChromeOptions(new Command("test")).exitOverride().configureOutput({
    writeErr: () => {},
  });
  command.parse(args, { from: "user" });
  return command.opts();
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("addChromeOptions", () => {
  it("reads defaults from the environment variables", () => {
    vi.stubEnv("CHROME_USER_DATA_DIR", "/env/profile");
    vi.stubEnv("CHROME_EXTENSIONS", "abc,/env/ext");
    vi.stubEnv("CHROME_EXECUTABLE", "/env/chrome");
    vi.stubEnv("DOWNLOAD_DIR", "/env/downloads");
    vi.stubEnv("KEEP_ALIVE", "true");

    expect(parseWith([])).toEqual({
      chromeUserDataDir: "/env/profile",
      chromeExtensions: "abc,/env/ext",
      chromeExecutable: "/env/chrome",
      downloadDir: "/env/downloads",
      keepAlive: true,
    });
  });

  it("lets command-line flags override the environment", () => {
    vi.stubEnv("CHROME_EXECUTABLE", "/env/chrome");
    vi.stubEnv("DOWNLOAD_DIR", "/env/downloads");

    const options = parseWith([
      "--chrome-executable", "/usr/bin/google-chrome-stable",
      "--download-dir", "/cli/downloads",
      "--chrome-user-data-dir", "/cli/profile",
      "--chrome-extensions", "abc",
      "--keep-alive",
    ]);

    expect(options).toMatchObject({
      chromeExecutable: "/usr/bin/google-chrome-stable",
      downloadDir: "/cli/downloads",
      chromeUserDataDir: "/cli/profile",
      chromeExtensions: "abc",
      keepAlive: true,
    });
  });

  it("disables keep-alive with --no-keep-alive even when KEEP_ALIVE is set", () => {
    vi.stubEnv("KEEP_ALIVE", "true");

    expect(parseWith(["--no-keep-alive"]).keepAlive).toBe(false);
  });

  it("treats KEEP_ALIVE=false as disabled", () => {
    vi.stubEnv("KEEP_ALIVE", "false");

    expect(parseWith([]).keepAlive).toBe(false);
  });

  it("leaves keep-alive off when neither the flag nor the environment sets it", () => {
    expect(parseWith([]).keepAlive).toBe(false);
  });

  it("hides --no-keep-alive from help output", () => {
    const command = addChromeOptions(new Command("test"));

    expect(command.helpInformation()).toMatch(/^\s+--keep-alive\s/m);
    expect(command.helpInformation()).not.toMatch(/^\s+--no-keep-alive/m);
  });
});

describe("parseChromeExtensions", () => {
  it("splits a comma-separated list and drops blank entries", () => {
    expect(parseChromeExtensions(" abc , ,/path/to/ext,")).toEqual(["abc", "/path/to/ext"]);
  });

  it("returns undefined when no list is given", () => {
    expect(parseChromeExtensions(undefined)).toBeUndefined();
  });
});

describe("chromeConfigFromOptions", () => {
  it("builds the daemon config from parsed options", () => {
    const config = chromeConfigFromOptions({
      chromeUserDataDir: "/profile",
      chromeExtensions: "abc, /ext",
      chromeExecutable: "/usr/bin/google-chrome-stable",
      downloadDir: "/downloads",
      keepAlive: true,
    });

    expect(config).toEqual({
      chromeUserDataDir: "/profile",
      chromeExtensions: ["abc", "/ext"],
      chromeExecutable: "/usr/bin/google-chrome-stable",
      downloadDir: "/downloads",
      keepAlive: true,
    });
  });

  it("serializes without unset options so the daemon uses its own defaults", () => {
    const config = chromeConfigFromOptions({ keepAlive: false });

    expect(JSON.parse(JSON.stringify(config))).toEqual({ keepAlive: false });
  });
});
