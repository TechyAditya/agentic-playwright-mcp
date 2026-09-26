import { describe, expect, it } from "vitest";
import { resolveTargetByUrl } from "../src/browser/pw-session.js";

/**
 * The URL fallback runs when CDP cannot name a page. It must answer only when
 * the URL identifies one tab, because a wrong answer is cached and every later
 * call for that targetId then drives another agent's tab.
 */
describe("resolving a target by URL", () => {
  it("answers when the URL belongs to exactly one tab", () => {
    const targets = [
      { id: "a", url: "https://www.amazon.in/" },
      { id: "b", url: "https://www.flipkart.com/" },
    ];
    const pages = ["https://www.amazon.in/", "https://www.flipkart.com/"];

    expect(resolveTargetByUrl(targets, pages, "a")).toBe(0);
    expect(resolveTargetByUrl(targets, pages, "b")).toBe(1);
  });

  it("refuses to guess between tabs that share a URL", () => {
    // Two tabs created blank at the same time. Ordering is not evidence.
    const targets = [
      { id: "a", url: "about:blank" },
      { id: "b", url: "about:blank" },
    ];
    const pages = ["about:blank", "about:blank"];

    expect(resolveTargetByUrl(targets, pages, "a")).toBeNull();
    expect(resolveTargetByUrl(targets, pages, "b")).toBeNull();
  });

  it("refuses when the target's URL matches several pages", () => {
    const targets = [{ id: "a", url: "about:blank" }];
    const pages = ["about:blank", "about:blank"];

    expect(resolveTargetByUrl(targets, pages, "a")).toBeNull();
  });

  it("returns null for an unknown target", () => {
    const targets = [{ id: "a", url: "https://example.com/" }];

    expect(resolveTargetByUrl(targets, pages(["https://example.com/"]), "zzz")).toBeNull();
  });
});

function pages(urls: string[]): string[] {
  return urls;
}
