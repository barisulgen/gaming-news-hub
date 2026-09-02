import { describe, expect, it } from "vitest";

import { dedupeByLink } from "./ingest";
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
