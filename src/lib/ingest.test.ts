import { afterEach, describe, expect, it, vi } from "vitest";

import { dedupeByLink, ingestFeeds } from "./ingest";
import type { FeedItem } from "./types";

const item = (link: string, sourceName: string): FeedItem => ({
  link,
  title: `Story at ${sourceName}`,
  excerpt: "",
  sourceId: sourceName.toLowerCase(),
  sourceName,
  topic: "data",
  timestamp: 1_756_700_000_000,
  time: "12:00",
  dayKey: "2026-09-01",
  dayLabel: "Today",
});

describe("dedupeByLink", () => {
  it("keeps the first occurrence of a repeated link", () => {
    const result = dedupeByLink([
      item("https://example.com/a", "PocketGamer.biz"),
      item("https://example.com/a", "Mobidictum"),
      item("https://example.com/b", "Naavik"),
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].sourceName).toBe("PocketGamer.biz");
    expect(result[1].link).toBe("https://example.com/b");
  });

  it("preserves input order", () => {
    const result = dedupeByLink([
      item("https://example.com/c", "A"),
      item("https://example.com/a", "B"),
      item("https://example.com/b", "C"),
    ]);

    expect(result.map((i) => i.link)).toEqual([
      "https://example.com/c",
      "https://example.com/a",
      "https://example.com/b",
    ]);
  });

  it("treats links differing only by trailing slash as distinct", () => {
    // Deliberate: dedupe is on the exact link, with no URL normalisation.
    const result = dedupeByLink([
      item("https://example.com/a", "A"),
      item("https://example.com/a/", "B"),
    ]);

    expect(result).toHaveLength(2);
  });

  it("returns an empty array unchanged", () => {
    expect(dedupeByLink([])).toEqual([]);
  });
});

/**
 * A feed behind Cloudflare can answer 403 to one request and 200 to the next.
 * These pin that a transient failure is retried, that a permanent one is not,
 * and — most importantly — that a failure never becomes a cached result.
 */
describe("transient failure handling", () => {
  const RSS = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0"><channel><title>T</title>
      <item>
        <title>A story</title>
        <link>https://example.com/a</link>
        <pubDate>${new Date().toUTCString()}</pubDate>
        <description>Some words.</description>
      </item>
    </channel></rss>`;

  const ok = () =>
    new Response(RSS, { status: 200, headers: { "content-type": "application/rss+xml" } });
  const fail = (status: number) => new Response("blocked", { status });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries a 403 and succeeds on the second attempt", async () => {
    const calls = new Map<string, number>();
    vi.stubGlobal("fetch", async (url: string) => {
      const n = (calls.get(url) ?? 0) + 1;
      calls.set(url, n);
      return n === 1 ? fail(403) : ok();
    });

    const { health } = await ingestFeeds({ cached: false });

    expect(health.every((f) => f.ok)).toBe(true);
    // Every source was tried twice: the 403, then the retry.
    expect([...calls.values()].every((n) => n === 2)).toBe(true);
  });

  it("retries once, then reports the failure", async () => {
    const calls = new Map<string, number>();
    vi.stubGlobal("fetch", async (url: string) => {
      calls.set(url, (calls.get(url) ?? 0) + 1);
      return fail(403);
    });

    const { health, items } = await ingestFeeds({ cached: false });

    expect(items).toHaveLength(0);
    expect(health.every((f) => !f.ok && f.error === "HTTP 403")).toBe(true);
    // Exactly one retry, not an unbounded loop.
    expect([...calls.values()].every((n) => n === 2)).toBe(true);
  });

  it("does not retry a status that will not change", async () => {
    const calls = new Map<string, number>();
    vi.stubGlobal("fetch", async (url: string) => {
      calls.set(url, (calls.get(url) ?? 0) + 1);
      return fail(404);
    });

    const { health } = await ingestFeeds({ cached: false });

    expect(health.every((f) => f.error === "HTTP 404")).toBe(true);
    expect([...calls.values()].every((n) => n === 1)).toBe(true);
  });

  it("reports why a request was rejected, not just the status", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response("Error code: 1015 — you are being rate limited", {
        status: 403,
        headers: { "cf-mitigated": "challenge" },
      }),
    );

    const { health } = await ingestFeeds({ cached: false });
    const message = health[0].error ?? "";

    // A bare "HTTP 403" cannot distinguish a rate limit from a real block.
    expect(message).toContain("HTTP 403");
    expect(message).toContain("cf-mitigated: challenge");
    expect(message).toContain("Cloudflare 1015");
  });

  it("keeps one dead feed from emptying the page", async () => {
    vi.stubGlobal("fetch", async (url: string) =>
      url.includes("gamingonphone") ? fail(403) : ok(),
    );

    const { items, health } = await ingestFeeds({ cached: false });

    expect(items.length).toBeGreaterThan(0);
    expect(health.filter((f) => !f.ok)).toHaveLength(1);
    expect(health.find((f) => !f.ok)?.sourceId).toBe("gamingonphone");
  });
});
