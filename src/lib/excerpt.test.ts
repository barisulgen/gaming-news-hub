import { describe, expect, it } from "vitest";

import { EXCERPT_LENGTH, decodeEntities, toExcerpt, truncateOnWordBoundary } from "./excerpt";

describe("decodeEntities", () => {
  it("decodes named, decimal and hex entities", () => {
    expect(decodeEntities("Tencent &amp; NetEase")).toBe("Tencent & NetEase");
    expect(decodeEntities("It&#8217;s here")).toBe("It’s here");
    expect(decodeEntities("It&#x2019;s here")).toBe("It’s here");
  });

  it("decodes only once, so an escaped entity survives as text", () => {
    expect(decodeEntities("&amp;lt;")).toBe("&lt;");
  });

  it("leaves unknown entities alone", () => {
    expect(decodeEntities("&notarealentity; stays")).toBe("&notarealentity; stays");
  });
});

describe("toExcerpt", () => {
  it("returns an empty string when the feed carried no description", () => {
    expect(toExcerpt(undefined)).toBe("");
    expect(toExcerpt(null)).toBe("");
    expect(toExcerpt("")).toBe("");
    expect(toExcerpt("   <p></p>  ")).toBe("");
  });

  it("strips tags and collapses whitespace", () => {
    expect(toExcerpt("<p>Hello   <b>there</b></p>\n\n<p>friend</p>")).toBe("Hello there friend");
  });

  it("does not run words together across block tags", () => {
    expect(toExcerpt("<p>one</p><p>two</p>")).toBe("one two");
  });

  it("drops script and style bodies rather than keeping their contents", () => {
    expect(toExcerpt("<style>.a{color:red}</style><p>Real text</p>")).toBe("Real text");
    expect(toExcerpt("<script>var x = 1;</script><p>Real text</p>")).toBe("Real text");
  });

  it("strips tags before decoding, so escaped markup survives as literal text", () => {
    expect(toExcerpt("<p>Use &lt;canvas&gt; for this</p>")).toBe("Use <canvas> for this");
  });

  it("keeps at most the excerpt length", () => {
    const body = `<p>${"word ".repeat(400)}</p>`;
    expect(toExcerpt(body).length).toBeLessThanOrEqual(EXCERPT_LENGTH);
  });

  it("truncates a full article body without splitting a word", () => {
    const body = `<div>${"Supercell announced a new title today. ".repeat(50)}</div>`;
    const result = toExcerpt(body);
    expect(result.endsWith("…")).toBe(true);
    expect(result.slice(0, -1)).not.toMatch(/\s$/);
    // Every retained word is a whole word from the source.
    for (const word of result.slice(0, -1).split(" ")) {
      expect("Supercell announced a new title today.").toContain(word);
    }
  });

  it("handles non-Latin text without splitting mid-word", () => {
    expect(toExcerpt("<p>Türk oyun sektörü büyüyor</p>")).toBe("Türk oyun sektörü büyüyor");
    expect(toExcerpt("<p>腾讯游戏发布新作</p>")).toBe("腾讯游戏发布新作");
  });
});

describe("truncateOnWordBoundary", () => {
  it("leaves text at or under the limit untouched", () => {
    expect(truncateOnWordBoundary("short", 20)).toBe("short");
    expect(truncateOnWordBoundary("exactly ten", 11)).toBe("exactly ten");
  });

  it("backs up to a word boundary and marks the cut", () => {
    expect(truncateOnWordBoundary("alpha beta gamma delta", 14)).toBe("alpha beta…");
  });

  it("cuts a single oversized word rather than returning nothing", () => {
    const result = truncateOnWordBoundary("a".repeat(50), 10);
    expect(result).toBe(`${"a".repeat(9)}…`);
  });

  it("does not leave dangling punctuation before the ellipsis", () => {
    expect(truncateOnWordBoundary("alpha beta, gamma delta", 16)).toBe("alpha beta…");
  });
});
