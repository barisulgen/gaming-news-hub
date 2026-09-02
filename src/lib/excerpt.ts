/** Maximum length of a stored excerpt, in characters. */
export const EXCERPT_LENGTH = 220;

/**
 * Upper bound on how much raw feed text is examined. Roughly half these feeds
 * ship complete article bodies — Naavik's run past 20,000 characters — and the
 * app keeps only a short excerpt. Slicing before any regex work bounds the cost
 * of processing a body we are about to throw away. The window is ~45x the
 * output length, far more than markup overhead can consume before the first
 * 220 characters of prose.
 */
const SCAN_WINDOW = 10_000;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  eacute: "é",
  egrave: "è",
  uuml: "ü",
  ouml: "ö",
  auml: "ä",
  ccedil: "ç",
  szlig: "ß",
  euro: "€",
  pound: "£",
  deg: "°",
  middot: "·",
  bull: "•",
  trade: "™",
  copy: "©",
  reg: "®",
};

/**
 * Decode HTML entities in a single pass, so an escaped entity such as
 * `&amp;lt;` decodes once to `&lt;` rather than twice to `<`.
 */
export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const codePoint =
        body[1] === "x" || body[1] === "X"
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) return match;
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return match;
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}

/**
 * Turn a raw feed description into a short plain-text excerpt.
 *
 * Tags are stripped before entities are decoded, so text a publisher escaped on
 * purpose (`&lt;div&gt;` in a post about markup) survives as literal characters
 * instead of being mistaken for markup and removed.
 */
export function toExcerpt(raw: string | undefined | null): string {
  if (!raw) return "";

  const windowed = raw.length > SCAN_WINDOW ? raw.slice(0, SCAN_WINDOW) : raw;

  const text = windowed
    // Drop script and style bodies outright rather than keeping their contents.
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // A space, not an empty string: "<p>one</p><p>two</p>" must not become
    // "onetwo".
    .replace(/<[^>]*>/g, " ");

  const collapsed = decodeEntities(text).replace(/\s+/g, " ").trim();

  return truncateOnWordBoundary(collapsed, EXCERPT_LENGTH);
}

/**
 * Cut to at most `limit` characters, backing up to the last word boundary so a
 * word is never split. An ellipsis marks that text was removed; it is included
 * in the length budget.
 */
export function truncateOnWordBoundary(text: string, limit: number): string {
  if (text.length <= limit) return text;

  const slice = text.slice(0, limit - 1);
  const lastSpace = slice.lastIndexOf(" ");
  // A single word longer than the limit has no boundary to back up to; cut it.
  const cut = lastSpace > limit * 0.5 ? slice.slice(0, lastSpace) : slice;

  return `${cut.replace(/[\s,;:.–—-]+$/, "")}…`;
}
