import type { ManualSource, Source } from "./types";

/**
 * Every feed the app ingests. To add one, append an entry here — nothing else
 * needs to change. Ingestion, the source filter, and feed health all read from
 * this array. Ids must be unique and stable: they are persisted in nothing, but
 * they key the filter UI.
 */
export const SOURCES: readonly Source[] = [
  { id: "pocketgamer", name: "PocketGamer.biz", url: "https://www.pocketgamer.biz/rss" },
  { id: "gamesindustry", name: "GamesIndustry.biz", url: "https://www.gamesindustry.biz/feed" },
  { id: "gamedeveloper", name: "Game Developer", url: "https://www.gamedeveloper.com/rss.xml" },
  { id: "mobilegamer", name: "Mobilegamer.biz", url: "https://mobilegamer.biz/feed/" },
  { id: "mobidictum", name: "Mobidictum", url: "https://mobidictum.com/feed/" },
  { id: "turkoyunsektoru", name: "Türk Oyun Sektörü", url: "https://www.turkoyunsektoru.com/feed" },
  { id: "gamigion", name: "Gamigion", url: "https://www.gamigion.com/feed/" },
  { id: "naavik", name: "Naavik", url: "https://naavik.co/feed/" },
  { id: "gamefile", name: "Game File", url: "https://www.gamefile.news/feed" },
  { id: "investgame", name: "InvestGame", url: "https://investgame.net/feed" },
  { id: "gamemakers", name: "GameMakers", url: "https://www.gamemakers.com/feed" },
  { id: "gamedevreports", name: "GameDev Reports", url: "https://gamedevreports.substack.com/feed" },
  { id: "brutallyhonest", name: "Brutally Honest", url: "https://lancaric.substack.com/feed" },
  { id: "nikopartners", name: "Niko Partners", url: "https://substack.nikopartners.com/feed" },
];

/** Cap applied per source before merging, so a 100-item feed cannot dominate. */
export const MAX_ITEMS_PER_SOURCE = 10;

/**
 * Items older than this are dropped, per source, before the cap is applied.
 *
 * The low-frequency newsletters each carry ten items reaching back months, so
 * without a cutoff the merged feed thins into a tail of single-item days. An
 * item that fails this test is dropped rather than counted against the cap, so
 * a weekly publisher still contributes everything it published this month.
 * Items with no parseable date fail it too — undated cannot be shown as recent.
 */
export const MAX_AGE_DAYS = 30;

/** Per-feed network timeout, in milliseconds. */
export const FEED_TIMEOUT_MS = 10_000;

/** Cache window for feed fetches, in seconds. Mirrored by `revalidate`. */
export const REVALIDATE_SECONDS = 900;

/**
 * Cache tag on every feed fetch. "Check now" on the Sources tab revalidates
 * this tag, which is what makes a manual recheck actually hit the publishers
 * instead of replaying the cached responses until the window expires.
 */
export const FEEDS_TAG = "feeds";

export const EMAIL_SOURCES: readonly ManualSource[] = [
  { name: "Deconstructor of Fun", url: "https://www.deconstructoroffun.com" },
  { name: "Mobile Dev Memo", url: "https://mobiledevmemo.com" },
  { name: "2.5 Gamers", url: "https://lancaric.me/2-5-gamers" },
];

export const MANUAL_SOURCES: readonly ManualSource[] = [
  // Has a perfectly good feed, but Cloudflare answers datacenter IPs with a
  // managed challenge, so a deployed copy can never read it. Works when the
  // app runs on a home connection; listed here because the deployed site is
  // the case that has to be honest.
  {
    name: "GamingonPhone",
    url: "https://gamingonphone.com",
    note: "feed blocked to servers",
  },
  { name: "Sensor Tower", url: "https://sensortower.com/blog" },
  { name: "AppMagic", url: "https://appmagic.rocks/research" },
  { name: "Newzoo", url: "https://newzoo.com" },
  { name: "TOGED", url: "https://toged.org/haberler" },
];
