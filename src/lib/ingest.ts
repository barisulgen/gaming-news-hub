import { unstable_cache } from "next/cache";
import Parser from "rss-parser";

import { toExcerpt } from "./excerpt";
import {
  FEEDS_TAG,
  FEED_TIMEOUT_MS,
  MAX_AGE_DAYS,
  MAX_ITEMS_PER_SOURCE,
  REVALIDATE_SECONDS,
  SOURCES,
} from "./sources";
import { formatDayKey, formatDayLabel, formatTime } from "./time";
import { classify } from "./topics";
import type { FeedHealth, FeedItem, IngestResult, Source } from "./types";

/**
 * `content:encoded` is captured under its own name so precedence stays explicit
 * rather than depending on how rss-parser happens to merge it with description.
 */
interface RawItem {
  title?: string;
  link?: string;
  isoDate?: string;
  pubDate?: string;
  summary?: string;
  description?: string;
  contentEncoded?: string;
  content?: string;
}

const parser: Parser<Record<string, unknown>, RawItem> = new Parser({
  customFields: {
    item: [
      ["description", "description"],
      ["content:encoded", "contentEncoded"],
    ],
  },
});

/**
 * Several of these publishers reject the default Node fetch agent. A plain
 * browser user agent is enough; nothing here evades rate limits or paywalls.
 */
const REQUEST_HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (compatible; MobileGamingNewsHub/1.0; +https://github.com/mobile-gaming-news-hub)",
  accept: "application/rss+xml, application/xml, text/xml, application/atom+xml;q=0.9, */*;q=0.8",
};

function charsetFromContentType(header: string | null): string | undefined {
  if (!header) return undefined;
  const match = /charset=["']?([\w-]+)/i.exec(header);
  return match?.[1]?.toLowerCase();
}

function charsetFromXmlDeclaration(bytes: Uint8Array): string | undefined {
  // The declaration is ASCII-compatible in every encoding we might meet here,
  // so a latin1 read of the first bytes is safe for finding it.
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 256));
  const match = /<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(head);
  return match?.[1]?.toLowerCase();
}

/**
 * Decode feed bytes using the charset the server declared, falling back to the
 * XML declaration and then UTF-8.
 *
 * This matters most for Türk Oyun Sektörü: decoding Turkish as the wrong
 * charset turns headlines into mojibake rather than failing outright, which is
 * easy to miss. `npm run check:feeds` scans for it.
 */
function decodeFeed(bytes: ArrayBuffer, contentType: string | null): string {
  const view = new Uint8Array(bytes);
  const declared = charsetFromContentType(contentType) ?? charsetFromXmlDeclaration(view);

  if (declared && declared !== "utf-8" && declared !== "utf8") {
    try {
      return new TextDecoder(declared).decode(view);
    } catch {
      // Unknown charset label: fall through to UTF-8 rather than fail the feed.
    }
  }

  return new TextDecoder("utf-8").decode(view);
}

/** Prefer the publisher's summary; use content:encoded only when there is none. */
function pickDescription(item: RawItem): string {
  const summary = item.summary?.trim();
  if (summary) return summary;

  const description = item.description?.trim();
  if (description) return description;

  const encoded = item.contentEncoded?.trim();
  if (encoded) return encoded;

  return item.content?.trim() ?? "";
}

function parseTimestamp(item: RawItem): number {
  const raw = item.isoDate ?? item.pubDate;
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Everything about an item that does not depend on the current time.
 *
 * This is the shape that gets cached. It carries a raw `timestamp` but none of
 * the formatted date fields, because those are relative to "now" and would
 * otherwise be baked into a 15 minute cache entry — "Today" would still say
 * Today tomorrow.
 */
type TimelessItem = Omit<FeedItem, "time" | "dayKey" | "dayLabel">;

function toTimelessItem(raw: RawItem, source: Source): TimelessItem | null {
  const link = raw.link?.trim();
  const title = raw.title?.trim();
  // A row with no link cannot be opened or tracked as read, and a row with no
  // title has nothing to scan. Neither is worth a line.
  if (!link || !title) return null;

  const cleanTitle = toExcerpt(title);
  // The full description is read here and never leaves this expression: only
  // the truncated result is kept on the item.
  const excerpt = toExcerpt(pickDescription(raw));

  return {
    link,
    title: cleanTitle,
    // A description that is merely the headline repeated adds a line of noise.
    excerpt: excerpt === cleanTitle ? "" : excerpt,
    sourceId: source.id,
    sourceName: source.name,
    topic: classify(cleanTitle, excerpt),
    timestamp: parseTimestamp(raw),
  };
}

/** Attach the date fields, which depend on when the page is being rendered. */
function withDates(item: TimelessItem, now: number): FeedItem {
  return {
    ...item,
    time: formatTime(item.timestamp),
    dayKey: formatDayKey(item.timestamp),
    dayLabel: formatDayLabel(item.timestamp, now),
  };
}

/** What one source contributes, before the age cutoff and cap are applied. */
interface SourceResult {
  items: TimelessItem[];
  ok: boolean;
  error?: string;
}

/**
 * Fetch and parse one feed, keeping only truncated items.
 *
 * `cache: "no-store"` is deliberate. Next's fetch cache would persist the raw
 * XML — hundreds of KB of complete article bodies per feed, written to
 * .next/cache — which is exactly what this app promises not to store, and it is
 * also what made GameDev Reports' 2.4MB feed blow the 2MB cache-item limit and
 * log an error on every render. The small derived result is cached instead, one
 * layer up in `readSource`.
 */
async function fetchSourceUncached(source: Source): Promise<SourceResult> {
  try {
    const response = await fetch(source.url, {
      headers: REQUEST_HEADERS,
      signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!response.ok) {
      return { items: [], ok: false, error: `HTTP ${response.status}` };
    }

    const xml = decodeFeed(await response.arrayBuffer(), response.headers.get("content-type"));
    const parsed = await parser.parseString(xml);

    const items = (parsed.items ?? [])
      .map((raw) => toTimelessItem(raw, source))
      .filter((item): item is TimelessItem => item !== null);

    return { items, ok: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.name === "TimeoutError" || error.name === "AbortError"
          ? `Timed out after ${FEED_TIMEOUT_MS / 1000}s`
          : error.message
        : "Unknown error";

    return { items: [], ok: false, error: message };
  }
}

/**
 * Cached readers, one per source, built once.
 *
 * `unstable_cache` folds a function's arguments into its cache key, so nothing
 * time-varying may be passed in — hence the cutoff, the cap and the date
 * formatting all live outside this layer. Rebuilding the wrapper per call would
 * also defeat it, so the readers are memoised here.
 */
const readers = new Map<string, () => Promise<SourceResult>>();

function readSource(source: Source): Promise<SourceResult> {
  let reader = readers.get(source.id);

  if (!reader) {
    reader = unstable_cache(() => fetchSourceUncached(source), ["feed", source.id], {
      revalidate: REVALIDATE_SECONDS,
      tags: [FEEDS_TAG],
    });
    readers.set(source.id, reader);
  }

  return reader();
}

async function collectSource(
  source: Source,
  now: number,
  useCache: boolean,
): Promise<{ items: FeedItem[]; health: FeedHealth }> {
  const base = { sourceId: source.id, sourceName: source.name, url: source.url };
  const {
    items: parsedItems,
    ok,
    error,
  } = useCache ? await readSource(source) : await fetchSourceUncached(source);

  if (!ok) {
    return { items: [], health: { ...base, itemCount: 0, ok: false, error } };
  }

  // Age cutoff runs before the cap, so a weekly publisher keeps everything it
  // published this month rather than spending its ten slots on last spring.
  const cutoff = now - MAX_AGE_DAYS * 86_400_000;
  const recent = parsedItems.filter((item) => item.timestamp >= cutoff);

  const items = recent
    // Newest first *before* the cap, so capping keeps the most recent items.
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_ITEMS_PER_SOURCE)
    .map((item) => withDates(item, now));

  return {
    items,
    health: {
      ...base,
      itemCount: items.length,
      droppedAsOld: parsedItems.length - recent.length,
      ok: true,
    },
  };
}

/** Keep the first occurrence of each link, preserving the order given. */
export function dedupeByLink(items: readonly FeedItem[]): FeedItem[] {
  const seen = new Set<string>();
  const out: FeedItem[] = [];

  for (const item of items) {
    if (seen.has(item.link)) continue;
    seen.add(item.link);
    out.push(item);
  }

  return out;
}

/**
 * Fetch every source in parallel and merge the results.
 *
 * A failing feed contributes an error to `health` and nothing to `items`; it
 * never takes the page down with it.
 *
 * `cached` must be false outside a Next request. `unstable_cache` needs Next's
 * incremental cache, which a plain `tsx` script does not have — and the tuning
 * scripts want live publisher data anyway, not a 15 minute old copy.
 */
export async function ingestFeeds({ cached = true } = {}): Promise<IngestResult> {
  const now = Date.now();

  const settled = await Promise.all(
    SOURCES.map((source) => collectSource(source, now, cached)),
  );

  const merged = settled.flatMap((result) => result.items);
  const items = dedupeByLink(merged).sort((a, b) => b.timestamp - a.timestamp);

  return { items, health: settled.map((result) => result.health), fetchedAt: now };
}
