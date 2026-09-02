import { describe, expect, it } from "vitest";

import { READ_CAP, SAVED_CAP, addRead, capRead, removeRead, toggleSaved } from "./readState";

const links = (count: number, prefix = "l") =>
  Array.from({ length: count }, (_, i) => `${prefix}${i}`);

describe("addRead", () => {
  it("appends a new link to the end", () => {
    expect(addRead(["a", "b"], "c")).toEqual(["a", "b", "c"]);
  });

  it("leaves an already-read link in place rather than reordering", () => {
    expect(addRead(["a", "b", "c"], "a")).toEqual(["a", "b", "c"]);
  });

  it("enforces the cap while adding", () => {
    const full = links(READ_CAP);
    const result = addRead(full, "newest");

    expect(result).toHaveLength(READ_CAP);
    expect(result.at(-1)).toBe("newest");
    // The oldest link is the one that went.
    expect(result).not.toContain("l0");
    expect(result[0]).toBe("l1");
  });
});

describe("removeRead", () => {
  it("takes a link back out, so the row counts as unread again", () => {
    expect(removeRead(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });

  it("returns the same list untouched when the link was never read", () => {
    const existing = ["a", "b"];
    expect(removeRead(existing, "zzz")).toBe(existing);
  });

  it("round-trips with addRead", () => {
    expect(removeRead(addRead(["a"], "b"), "b")).toEqual(["a"]);
  });
});

describe("toggleSaved", () => {
  it("adds a link that is absent and removes one that is present", () => {
    expect(toggleSaved(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleSaved(["a", "b"], "a")).toEqual(["b"]);
  });

  it("drops the oldest saved link once the cap is reached", () => {
    const full = links(SAVED_CAP, "s");
    const result = toggleSaved(full, "newest");

    expect(result).toHaveLength(SAVED_CAP);
    expect(result.at(-1)).toBe("newest");
    expect(result).not.toContain("s0");
  });

  it("un-saving never trips the cap", () => {
    const full = links(SAVED_CAP, "s");
    expect(toggleSaved(full, "s0")).toHaveLength(SAVED_CAP - 1);
  });
});

describe("capRead", () => {
  it("leaves a list within the cap untouched", () => {
    const under = links(10);
    expect(capRead(under)).toEqual(under);
    expect(capRead(links(READ_CAP))).toHaveLength(READ_CAP);
  });

  it("drops oldest first when over the cap", () => {
    const over = links(READ_CAP + 5);
    const result = capRead(over);

    expect(result).toHaveLength(READ_CAP);
    expect(result[0]).toBe("l5");
    expect(result.at(-1)).toBe(`l${READ_CAP + 4}`);
  });
});
