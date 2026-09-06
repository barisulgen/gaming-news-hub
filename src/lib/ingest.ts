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
    "Mozilla/5.0 (compatible; MobileGamingNews/1.0; +https://github.com/mobile-gaming-news)",
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

/**
 * Statuses worth one retry.
 *
 * GamingonPhone sits behind Cloudflare, which intermittently answers 403 to a
 * server-side client that a browser and curl both get 200 from moments later —
 * throttling rather than a real refusal, and it shows up after several feeds
 * are fetched in quick succession. 429 and the 5xx range are transient for the
 * same reason.
 */
const TRANSIENT_STATUS = new Set([403, 408, 425, 429, 500, 502, 503, 504]);

const RETRY_DELAY_MS = 800;

class FeedError extends Error {
  readonly status?: number;
  /** Set when the response proves retrying cannot help. */
  readonly permanent: boolean;

  constructor(message: string, status?: number, permanent = false) {
    super(message);
    this.name = "FeedError";
    this.status = status;
    this.permanent = permanent;
  }
}

/** Turn anything thrown during a fetch into one readable message. */
function toFeedError(error: unknown): FeedError {
  if (error instanceof FeedError) return error;

  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return new FeedError(`Timed out after ${FEED_TIMEOUT_MS / 1000}s`);
    }
    return new FeedError(error.message);
  }

  return new FeedError("Unknown error");
}

function isRetryable(error: unknown): boolean {
  if (error instanceof FeedError) {
    // A bot challenge is not a transient hiccup: no HTTP client can solve it,
    // so a second attempt only re-hits a server that already said no.
    if (error.permanent) return false;
    // A network-level failure has no status and is worth one more try.
    return error.status === undefined || TRANSIENT_STATUS.has(error.status);
  }
  return true;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Build a failure message that says *why*, not just the status.
 *
 * A bare "HTTP 403" is indistinguishable between a WAF challenge, a rate
 * limit, and a genuine block, which is exactly the distinction needed to know
 * whether retrying is pointless. Cloudflare states its reason in
 * `cf-mitigated`, and its error pages carry a numeric code in the body.
 * The body is read only on failure and only the first 200 characters.
 */
async function describeRejection(
  response: Response,
): Promise<{ message: string; permanent: boolean }> {
  const parts = [`HTTP ${response.status}`];

  const mitigated = response.headers.get("cf-mitigated");
  if (mitigated) parts.push(`cf-mitigated: ${mitigated}`);

  // A challenge demands the client execute JavaScript to prove it is a
  // browser. A server-side fetch never can, so this is permanent for us.
  let permanent = mitigated === "challenge";

  try {
    const body = (await response.text()).slice(0, 200);
    const code = /\berror\s*(?:code)?[: ]\s*(\d{3,4})\b/i.exec(body)?.[1];
    if (code) parts.push(`Cloudflare ${code}`);
    if (/just a moment|checking your browser|challenge/i.test(body)) {
      if (!code) parts.push("bot challenge page");
      permanent = true;
    }
  } catch {
    // The body is a nicety; never let reading it mask the real status.
  }

  return { message: parts.join(" · "), permanent };
}

/**
 * Fetch and parse one feed, keeping only truncated items.
 *
 * Throws on any failure rather than returning an error value, which is what
 * keeps a failure out of the cache — see `readSource`.
 *
 * `cache: "no-store"` is deliberate. Next's fetch cache would persist the raw
 * XML — hundreds of KB of complete article bodies per feed, written to
 * .next/cache — which is exactly what this app promises not to store, and it is
 * also what made GameDev Reports' 2.4MB feed blow the 2MB cache-item limit.
 */
async function fetchOnce(source: Source): Promise<TimelessItem[]> {
  const response = await fetch(source.url, {
    // Per-source headers win, so a publisher that needs a browser client or a
    // feed token gets one without changing how we identify to the rest.
    headers: { ...REQUEST_HEADERS, ...source.headers },
    signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
    cache: "no-store",
  });

  if (!response.ok) {
    const { message, permanent } = await describeRejection(response);
    throw new FeedError(message, response.status, permanent);
  }

  const text = decodeFeed(await response.arrayBuffer(), response.headers.get("content-type"));

  if (source.kind === "wp-json") return wpPostsToItems(text, source);

  const parsed = await parser.parseString(text);

  return (parsed.items ?? [])
    .map((raw) => toTimelessItem(raw, source))
    .filter((item): item is TimelessItem => item !== null);
}

/** The subset of a WordPress REST post this app asks for and reads. */
interface WpPost {
  link?: string;
  date_gmt?: string;
  title?: { rendered?: string };
  excerpt?: { rendered?: string };
}

/**
 * Read a WordPress REST collection instead of an RSS feed.
 *
 * Some publishers put bot protection on their feed path while leaving the REST
 * API open. It is the same public content from the same site, carries the same
 * fields, and `_fields` keeps the response small — the excerpt arrives already
 * short, so far less is transferred than the feed sends.
 *
 * `date_gmt` has no timezone suffix, so it is read as UTC explicitly rather
 * than being parsed as local time.
 */
function wpPostsToItems(body: string, source: Source): TimelessItem[] {
  const parsed: unknown = JSON.parse(body);
  if (!Array.isArray(parsed)) return [];

  return (parsed as WpPost[])
    .map((post) => {
      const link = post.link?.trim();
      const title = toExcerpt(post.title?.rendered ?? "");
      if (!link || !title) return null;

      const excerpt = toExcerpt(post.excerpt?.rendered ?? "");
      const stamp = post.date_gmt ? Date.parse(`${post.date_gmt}Z`) : Number.NaN;

      return {
        link,
        title,
        excerpt: excerpt === title ? "" : excerpt,
        sourceId: source.id,
        sourceName: source.name,
        topic: classify(title, excerpt),
        timestamp: Number.isNaN(stamp) ? 0 : stamp,
      };
    })
    .filter((item): item is TimelessItem => item !== null);
}

/** One retry on a transient failure, then give up and let the error out. */
async function fetchSourceItems(source: Source): Promise<TimelessItem[]> {
  try {
    return await fetchOnce(source);
  } catch (error) {
    if (!isRetryable(error)) throw toFeedError(error);

    await sleep(RETRY_DELAY_MS);

    try {
      return await fetchOnce(source);
    } catch (retryError) {
      throw toFeedError(retryError);
    }
  }
}

/**
 * Cached readers, one per source, built once.
 *
 * `unstable_cache` folds a function's arguments into its cache key, so nothing
 * time-varying may be passed in — hence the cutoff, the cap and the date
 * formatting all live outside this layer. Rebuilding the wrapper per call would
 * also defeat it, so the readers are memoised here.
 *
 * Because `fetchSourceItems` throws rather than returning an error value, a
 * failure is never written to the cache. That matters: caching one transient
 * 403 would mark a healthy feed dead for the whole 15 minute window, and the
 * next render would keep reporting it dead without retrying.
 */
const readers = new Map<string, () => Promise<TimelessItem[]>>();

function readSource(source: Source): Promise<TimelessItem[]> {
  let reader = readers.get(source.id);

  if (!reader) {
    reader = unstable_cache(() => fetchSourceItems(source), ["feed", source.id], {
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

  let parsedItems: TimelessItem[];
  try {
    parsedItems = useCache ? await readSource(source) : await fetchSourceItems(source);
  } catch (error) {
    return {
      items: [],
      health: { ...base, itemCount: 0, ok: false, error: toFeedError(error).message },
    };
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
