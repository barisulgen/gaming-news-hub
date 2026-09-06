export type TopicId =
  | "deals"
  | "people"
  | "launch"
  | "policy"
  | "ua"
  | "data"
  | "events"
  | "opinion"
  | "other";

export interface Source {
  /** Stable id used in filter state and as a React key. */
  id: string;
  name: string;
  url: string;
  /**
   * Per-source request headers, merged over the defaults. For publishers whose
   * WAF rejects a self-identifying client, or that issue a feed token.
   */
  headers?: Record<string, string>;
  /**
   * How to read this source. Defaults to "rss". "wp-json" reads a WordPress
   * REST collection instead, for publishers whose feed path is unreachable.
   */
  kind?: "rss" | "wp-json";
}

/**
 * A single row in the feed. This is the only shape that crosses the
 * server/client boundary, and it deliberately has no field capable of holding
 * an article body — `excerpt` is capped during ingestion.
 */
export interface FeedItem {
  /** Article URL. Doubles as the dedupe key and the read-state key. */
  link: string;
  title: string;
  /** Up to 220 characters, or "" where the publisher sent no description. */
  excerpt: string;
  sourceId: string;
  sourceName: string;
  topic: TopicId;
  /** Epoch milliseconds, used for sorting. */
  timestamp: number;
  /** "14:32", already localised to Europe/Istanbul on the server. */
  time: string;
  /** "2026-09-01" in Europe/Istanbul, used to group rows under day headings. */
  dayKey: string;
  /** "Monday, 1 September", already localised on the server. */
  dayLabel: string;
}

export interface FeedHealth {
  sourceId: string;
  sourceName: string;
  url: string;
  /** Items kept after the age cutoff and the per-source cap. */
  itemCount: number;
  /** Items the feed carried that fell outside the age cutoff. */
  droppedAsOld?: number;
  ok: boolean;
  /** Present only when the fetch or parse failed. */
  error?: string;
}

export interface IngestResult {
  items: FeedItem[];
  health: FeedHealth[];
  /** Epoch milliseconds at which this snapshot was assembled. */
  fetchedAt: number;
}

/** A publication with no usable feed, surfaced on the Sources tab. */
export interface ManualSource {
  name: string;
  url: string;
}
