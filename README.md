# Mobile gaming news hub

Fifteen mobile games industry feeds merged into one dense page, built for
scanning rather than reading. Every row links out to the publisher.

```bash
npm install
npm run dev          # http://localhost:3000
```

| Command | Does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm test` | Unit tests for the classifier, excerpt, dedupe and read-state |
| `npm run check:feeds` | Fetch all feeds once and report counts, topics and encoding |
| `npm run dump:unclassified` | Write `reports/unclassified.txt` for tuning keywords |
| `npm run typecheck` | `tsc --noEmit` |

## What it does and does not do

Item text comes only from the publisher's own `description` (or `content:encoded`
where there is no description). Nothing is summarised or rewritten, and no
language model is involved anywhere — topic assignment is keyword matching in
[topics.ts](src/lib/topics.ts).

Roughly half these feeds send complete article bodies. The app keeps the first
220 characters and discards the rest during ingestion; a full body never reaches
a React component and is never written anywhere. Rows are text only — no image
from a feed is parsed, fetched, proxied or rendered.

## Adding a source

Append an entry to `SOURCES` in [sources.ts](src/lib/sources.ts):

```ts
{ id: "example", name: "Example.biz", url: "https://example.biz/feed" },
```

That is the only change needed. Ingestion, the source filter with its counts,
and the feed health table all read from that array. The `id` must be unique;
the `name` is what appears beside every headline.

Then check it actually works:

```bash
npm run check:feeds
```

The report gives per-feed item counts, the topic split, excerpt coverage, and a
mojibake scan. A new feed showing `EMPTY` parsed but yielded nothing usable —
usually items missing a `link` or `title`, which are skipped deliberately.

Publications with no usable feed belong in `EMAIL_SOURCES` or `MANUAL_SOURCES`
in the same file; they appear as launchers on the Sources tab instead.

### Age cutoff and per-source cap

Two limits run per source, in this order:

1. **`MAX_AGE_DAYS` (30)** drops anything older than 30 days.
2. **`MAX_ITEMS_PER_SOURCE` (10)** keeps the newest 10 of what survives.

The order matters. Cutting by age first means a weekly publisher keeps
everything it ran this month instead of spending its ten slots on last spring —
the low-frequency newsletters each carry ten items reaching back months, and
without the cutoff the merged feed thins into a tail of single-item days.

Items with no parseable date fail the cutoff too: undated cannot be shown as
recent.

A feed can now legitimately return zero items because everything it carries is
older than the cutoff. Feed health calls that "Nothing in the last 30 days",
distinct from a feed that is actually broken.

## Topics

Nine buckets, in [topics.ts](src/lib/topics.ts). Eight carry keyword rules;
`other` has none and is where unmatched items land, so `data` means "matched a
data keyword" rather than "everything else". The size of the grey run in the
spine is a direct readout of how much keyword tuning is outstanding.

**The title is matched first, against every rule, before the excerpt is read at
all.** Only if no rule matches the headline does the excerpt get a turn. A
headline states what a story is about; an excerpt merely mentions things, and
matching both at once let a keyword in the third sentence of an excerpt outrank
the headline.

Rules are tried in `TOPICS` order and the first hit wins, which means **every
keyword added to an early bucket takes items from later ones**. Two placements
depend on this:

- `people` sits above `launch` and `policy`, so a studio furloughed "ahead of
  launch" and a store executive stepping down land as people stories.
- `events` and `opinion` sit last, because a funding round announced at a
  conference is a deal first, and `how to` / `why` would otherwise swallow half
  the feed before `ua` or `data` saw it.

`policy` deliberately has no bare `apple` or `google` keyword. Those fired on
any story mentioning either company — quarterly revenue, a podcast segment —
and pulled it out of the right bucket. Store contexts (`app store`,
`play store`, `google play`) are what the rule is for.

Check the effect of any change with `npm run dump:unclassified`, which reports
the token that fired for each item and whether it hit the title or only the
excerpt.

Matching is word-boundary regex, not substring: `\bua\b` does not fire on
"usual" or "Ukraine", `\bstakes?\b` does not fire on "mistake". The tests in
[topics.test.ts](src/lib/topics.test.ts) pin this.

### Turkish keywords

Türk Oyun Sektörü publishes in Turkish, so each bucket carries a second pattern
in the `TR` map alongside its English one. Two things make these different from
the English rules, and both are pinned by tests:

- **They cannot use `\b`.** JavaScript defines a word boundary against
  `[A-Za-z0-9_]`, so ö, ü, ç, ş, ğ and ı are not word characters. There is no
  boundary between the space and the ö in " ödül", and `\bödül` would silently
  never match. The Turkish patterns use Unicode lookarounds — `(?<!\p{L})` —
  which require the `u` flag.
- **`"İ".toLowerCase()` is `i` + U+0307**, a combining dot, not a plain `i`. A
  headline starting "İstifa" would not match the keyword `istifa`, so `fold()`
  strips that combining dot before matching.

Turkish is agglutinative, so most Turkish keywords omit a trailing boundary on
purpose: `yatırım` is meant to catch yatırımı, yatırımlar and yatırımcı. Two are
pinned because the open prefix would over-match, and each is pinned differently:

- `pazar` (market) is pinned with a trailing boundary so it cannot fire on
  `Pazartesi` (Monday) — a longer word.
- `zirvesi` (summit) is pinned to the possessive form, because a trailing
  boundary would not help: bare `zirve` also means "peak" or "top", so
  "listelerde zirve" (top of the charts) would put a chart story in events.
  Turkish names a summit with the possessive — "Oyun Zirvesi" — while the
  chart sense stays bare.

The terms were chosen from the feed's own headlines rather than from a
dictionary, but they are worth a native speaker's review.

### The ceiling

Keyword matching stops around 80% here. "Supercell shutters Clash Mini" contains
no keyword from any bucket and no reasonable list would catch it. A funding
round that is also a launch gets one label under first-hit-wins. And some items
are a *format* rather than a subject — Türk Oyun Sektörü's "Bu Hafta" weekly
digests are a roundup of everything, so `other` is the honest bucket for them,
not a gap to be closed.

## How the cache window works

Both routes are statically generated and revalidated every 15 minutes
(`export const revalidate = 900` in [page.tsx](src/app/page.tsx) and
[sources/page.tsx](src/app/sources/page.tsx)). Individual feed fetches carry the
same `revalidate`, so the two tabs share one fetch rather than each hitting all
15 feeds.

A request arriving inside the window is served the cached page immediately. The
first request after the window expires gets the cached page too, and triggers a
background refresh that the *next* visitor sees. So the page can be up to about
15 minutes stale, occasionally a little more.

There is no cron and no background job. Feeds are fetched because someone asked
for the page.

**Check now**, on the Sources tab, forces a re-fetch without waiting out the
window. Every feed fetch carries the `feeds` cache tag, and the button's server
action in [actions.ts](src/app/actions.ts) expires that tag with `updateTag`.
`revalidateTag` would not do — in Next 16 it takes a cache-life profile and
defers, whereas the render right after the click has to see the new data.
Expect the counts to come back identical much of the time; publishers do not
post every quarter hour, so the button confirms in words that it ran.

`REVALIDATE_SECONDS` in `sources.ts` must be changed alongside the two
`revalidate` exports — Next requires a literal there, so it cannot import the
constant.

Each feed gets a 10-second timeout. A feed that fails, times out, or returns a
non-200 is skipped and recorded; it never blanks the page. What happened shows
on the Sources tab under feed health.

Feed bytes are decoded using the charset the server declares, falling back to
the XML declaration and then UTF-8. Getting this wrong produces mojibake rather
than an error, which is easy to miss, so `npm run check:feeds` scans every row
for it and prints sample Türk Oyun Sektörü headlines to eyeball.

## How read-state is stored

Entirely in your browser. There is no account, no database, and no server-side
record of what you have read.

| Key | Holds |
| --- | --- |
| `mgnh.read.v1` | JSON array of article links you have opened, oldest first |
| `mgnh.saved.v1` | JSON array of links you saved, oldest first |
| `mgnh.hideRead.v1` | `"true"` / `"false"` for the hide read toggle |

Clicking a headline adds its link. Read rows dim, but keep their topic border at
full strength so the colour down the left edge still shows the shape of the day.

Hovering a row reveals two controls, both also reachable by keyboard:

- **Save** keeps a row in `mgnh.saved.v1`. The rail's **Saved only** toggle
  filters to those. Unlike hide read, that toggle is not persisted — returning
  to a feed that looks empty because of a forgotten filter is a bad welcome.
- **Unread** appears on rows already read and takes the link back out, so the
  row counts as unread again.

Read links are capped at 2000 and saved links at 500, oldest dropped first. The
saved cap is far lower on purpose: saving is deliberate, so losing one matters
more than losing a read marker, and reaching 500 means the list has stopped
being a shortlist.

Because the key is the article link, an item that rolls out of a feed and later
reappears counts as unread again. That is accepted, not worked around. The same
applies to saved items: the rail's saved count reports how many saved links are
still present in the current fetch, which can be lower than the number in
storage.

### Clearing it

Use **Mark all as read** in the header to mark, not to clear. To actually reset,
run this in the browser console on the site's origin:

```js
localStorage.removeItem("mgnh.read.v1");
localStorage.removeItem("mgnh.saved.v1");
localStorage.removeItem("mgnh.hideRead.v1");
location.reload();
```

Clearing site data for `localhost:3000` in your browser's settings does the same
thing. Read-state does not sync between browsers or devices.

## Layout notes

Rows use a gutter: time and source name sit in two aligned left-hand columns,
with the headline and a one-line excerpt to their right. The excerpt is stored
at 220 characters and clipped visually to the row width, which keeps the row to
two visual lines and the page dense. Below `sm`, the gutter stacks above the
headline and the rail moves above the feed.

Day headings appear in the newest-first and oldest-first sorts; the source sort
shows a heading per source instead. "Today" and "Yesterday" are resolved when
the page is rendered, so within 15 minutes of midnight a heading can lag until
the next revalidation.

Times are Europe/Istanbul, formatted on the server so the rendered page does not
depend on the viewer's clock.
