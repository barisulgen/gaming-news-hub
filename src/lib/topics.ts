import type { TopicId } from "./types";

interface TopicMeta {
  id: TopicId;
  label: string;
  colour: string;
}

/**
 * Display order in the rail, and the order classification rules are tried in.
 *
 * `other` is last and has no keywords: it is where unmatched items land. Its
 * grey is deliberately the quietest colour in the set, so the size of the grey
 * run in the spine reads as "not yet classified" rather than as a topic, and
 * shows at a glance how much tuning the keyword lists still need.
 */
export const TOPICS: readonly TopicMeta[] = [
  { id: "deals", label: "Deals", colour: "#2E6F4E" },
  { id: "people", label: "People", colour: "#4A6070" },
  { id: "launch", label: "Launch", colour: "#2B5CA8" },
  { id: "policy", label: "Policy", colour: "#A8452B" },
  { id: "ua", label: "UA", colour: "#71479A" },
  { id: "data", label: "Data", colour: "#8A6D1F" },
  { id: "events", label: "Events", colour: "#1E7A76" },
  { id: "opinion", label: "Opinion", colour: "#96406B" },
  { id: "other", label: "Other", colour: "#8C8F88" },
];

/** The bucket an item falls into when no keyword rule matches. */
const FALLBACK_TOPIC: TopicId = "other";

export const TOPIC_COLOUR: Record<TopicId, string> = Object.fromEntries(
  TOPICS.map((t) => [t.id, t.colour]),
) as Record<TopicId, string>;

export const TOPIC_LABEL: Record<TopicId, string> = Object.fromEntries(
  TOPICS.map((t) => [t.id, t.label]),
) as Record<TopicId, string>;

/**
 * Turkish keywords for Türk Oyun Sektörü, the one feed that does not publish in
 * English.
 *
 * These cannot use `\b`. JavaScript defines a word boundary against
 * `[A-Za-z0-9_]`, so ö, ü, ç, ş, ğ and ı are not word characters — there is no
 * boundary between the space and the ö in " ödül", and `\bödül` would silently
 * never match. Unicode lookarounds are used instead, which need the `u` flag.
 *
 * Turkish is agglutinative, so most of these deliberately omit a trailing
 * boundary: "yatırım" is meant to catch yatırımı, yatırımlar and yatırımcı.
 * Where a prefix would over-match it is pinned — "pazar" (market) is pinned so
 * it cannot fire on "Pazartesi" (Monday).
 */
const TR = {
  deals: /(?<!\p{L})(?:yatırım|satın al|devralma|birleşme|hisse|sermaye|fonlama)/u,
  people:
    /(?<!\p{L})(?:istifa|atandı|atama|işten çıkar|ayrıldı|katıldı|terfi|görevden)/u,
  launch: /(?<!\p{L})(?:lansman|yayınlan|erken erişim|ön kayıt|çıkış yaptı)/u,
  policy: /(?<!\p{L})(?:yasak|mahkeme|düzenleme|dava|lisans|telif|soruşturma)/u,
  ua: /(?<!\p{L})(?:kullanıcı edinme|reklam|tıklama başına)/u,
  data: /(?<!\p{L})(?:rapor|indirme|gelirler|geliri(?!\p{L})|ciro|büyüme|pazar(?:ı|da)?(?!\p{L}))/u,
  // `zirvesi`, not `zirve`. The bare word means "peak" or "top" as often as it
  // means a summit, so "listelerde zirve" (top of the charts) would fire events
  // on a chart-performance story. Turkish names a summit with the possessive —
  // "Oyun Zirvesi" — while the chart sense stays bare, so requiring the
  // possessive keeps the event and drops the metaphor.
  events: /(?<!\p{L})(?:etkinlik|ödül|fuar|konferans|zirvesi)/u,
  opinion: /(?<!\p{L})(?:röportaj|analiz|yorum|neden)/u,
} as const;

/**
 * Keyword rules, tried in `TOPICS` order — first hit wins. Each bucket carries
 * an English pattern and a Turkish one.
 *
 * Short acronyms are anchored on both sides (`\bua\b`) so they cannot match
 * inside a longer word; `att` must not fire on "attribution", and `ua` must not
 * fire on "actual". Longer stems are anchored only at the start, so ordinary
 * inflections ("acquires", "acquired", "acquiring") all match one pattern.
 * The haystack is folded to lowercase first, so every pattern is lowercase.
 */
const RULES: ReadonlyArray<{ topic: TopicId; patterns: readonly RegExp[] }> = [
  {
    topic: "deals",
    patterns: [
      /\braise[sd]?\b|\bfunding\b|\bseries [abc]\b|\bacquir(?:e|es|ed|ing)\b|\bacquisitions?\b|\bmergers?\b|\bstakes?\b|\binvest(?:s|ed|ing|ment|ments|or|ors)?\b|\bipo\b|\bvaluations?\b|\bbuys\b|\bbought\b|\bdivest(?:s|ed|ing|ment|ments)?\b/,
      TR.deals,
    ],
  },
  {
    // Ahead of launch and policy: a story about someone furloughed "ahead of
    // launch", or an App Store executive stepping down, is a people story that
    // happens to mention a launch or a store.
    topic: "people",
    patterns: [
      /\bappoint(?:s|ed|ment|ments)?\b|\bjoins\b|\bsteps down\b|\bhire[sd]?\b|\blay[- ]?offs?\b|\bceo\b|\bpromot(?:ed|es|ion)\b|\bfurlough(?:s|ed|ing)?\b|\bdepart(?:s|ed|ure|ures)\b|\bexits\b|\bleaves\b/,
      TR.people,
    ],
  },
  {
    topic: "launch",
    patterns: [
      /\bsoft launch\w*\b|\blaunch(?:es|ed|ing)?\b|\brelease[sd]?\b|\breleasing\b|\bout now\b|\bpre-?registrations?\b|\bpre-?register\w*\b|\bbetas?\b/,
      TR.launch,
    ],
  },
  {
    // Bare `apple` and `google` are deliberately absent. They fired on any
    // story that mentioned either company — quarterly revenue, a podcast
    // segment — and dragged it out of the bucket it belonged in. Store
    // contexts are what the policy rule is actually for.
    topic: "policy",
    patterns: [
      /\bapp store\b|\bplay store\b|\bgoogle play\b|\bregulat(?:e|es|ed|ion|ions|or|ors|ory)\b|\brulings?\b|\blawsuits?\b|\bnppa\b|\blicen[cs](?:e|es|ing|ed)\b|\bcourts?\b|\bantitrust\b|\brefunds?\b|\bcomplian(?:ce|t)\b/,
      TR.policy,
    ],
  },
  {
    topic: "ua",
    patterns: [
      /\buser acquisition\b|\bua\b|\bcreatives\b|\bcpi\b|\broas\b|\batt\b|\battribution\b|\bplayables?\b|\bad spend\b|\bmoneti[sz]ation\b/,
      TR.ua,
    ],
  },
  {
    topic: "data",
    patterns: [
      /\brevenues?\b|\bdownloads?\b|\btop[- ]grossing\b|\breport(?:s|ing)?\b|\bmarkets?\b|\bforecasts?\b|\bcharts?\b/,
      TR.data,
    ],
  },
  {
    // Late on purpose. Trade-show coverage is usually *about* something else —
    // a funding round announced at a conference is a deal first. Placing events
    // here means it catches the stories that are only about the show.
    topic: "events",
    patterns: [
      /\bgamescom\b|\bchinajoy\b|\bgdc\b|\bpocket gamer connects\b|\bdevcom\b|\btokyo game show\b|\bopening night live\b|\bleap 20\d\d\b|\bconferences?\b|\bkeynotes?\b|\bshowcas(?:e|es|ed|ing)\b|\bexpo\b|\bsummit\b|\bawards\b/,
      TR.events,
    ],
  },
  {
    // Latest of the keyword buckets. "How to" and "why" are broad enough to
    // swallow half the feed if they run early — "How to cut CPI" has to reach
    // `ua` before it reaches here.
    topic: "opinion",
    patterns: [
      /\bopinion\b|\bop-?ed\b|\beditorial\b|\binterviews?\b|\bpodcasts?\b|\banalysis\b|\bcolumn\b|\bessays?\b|\bq&a\b|\blessons?\b|\btakeaways?\b|\bexplains?\b|\bhow to\b|\bwhy\b/,
      TR.opinion,
    ],
  },
];

/**
 * Lowercase, then drop the combining dot above.
 *
 * `"İstifa".toLowerCase()` returns "i" followed by U+0307, not a plain "i", so
 * a Turkish headline starting with İ would not match the keyword `istifa`.
 * Removing the combining dot makes the two forms comparable. The dot appears in
 * essentially no other context in this corpus.
 */
function fold(text: string): string {
  return text.toLowerCase().replace(/̇/g, "");
}

/** First pattern in the list that matches, or null. */
function firstHit(patterns: readonly RegExp[], haystack: string): string | null {
  for (const pattern of patterns) {
    const found = pattern.exec(haystack);
    if (found) return found[0];
  }
  return null;
}

/**
 * Assign a topic, reporting whether a rule actually fired, which token fired,
 * and whether it hit the title or only the excerpt.
 *
 * `matched: false` means the item landed in `other` because nothing matched.
 * Since `other` has no keywords of its own, `topic === "other"` and
 * `matched === false` now say the same thing; the flag stays because the tuning
 * scripts read it, and because a future `other` rule would separate them again.
 */
export function classifyWithMatch(
  title: string,
  excerpt: string,
): { topic: TopicId; matched: boolean; hit?: string; inTitle?: boolean } {
  const lowerTitle = fold(title);

  // Title first, every rule, before the excerpt is consulted at all. A headline
  // states what a story is about; an excerpt merely mentions things. Reading
  // both at once let a keyword buried in the third sentence of an excerpt
  // outrank the headline — that is how "Savvy Games Group CEO Brian Ward steps
  // down" landed in `deals` on the word "investment".
  for (const rule of RULES) {
    const hit = firstHit(rule.patterns, lowerTitle);
    if (hit) return { topic: rule.topic, matched: true, hit, inTitle: true };
  }

  // Only when the headline says nothing recognisable does the excerpt get a
  // turn. This still misfires — an excerpt keyword can be incidental — so the
  // tuning report marks these separately.
  const haystack = `${lowerTitle} ${fold(excerpt)}`;
  for (const rule of RULES) {
    const hit = firstHit(rule.patterns, haystack);
    if (hit) return { topic: rule.topic, matched: true, hit, inTitle: false };
  }

  return { topic: FALLBACK_TOPIC, matched: false };
}

/**
 * Assign a topic from the title and excerpt. Purely lexical — no model is
 * involved, and none should be. Falls back to `other` when nothing matches, so
 * `data` means "matched a data keyword" rather than "everything else".
 */
export function classify(title: string, excerpt: string): TopicId {
  return classifyWithMatch(title, excerpt).topic;
}
