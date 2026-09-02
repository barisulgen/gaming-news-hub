/**
 * Fetch every source once and report what came back.
 *
 * Run with `npm run check:feeds`. This exercises the same ingestion module the
 * app uses, so a problem here is a problem on the page. Useful after adding a
 * source, or when a row looks wrong and you want to see the raw shape of it.
 */
import { EXCERPT_LENGTH } from "../src/lib/excerpt";
import { ingestFeeds } from "../src/lib/ingest";
import { SOURCES } from "../src/lib/sources";
import { TOPICS } from "../src/lib/topics";
import type { FeedItem } from "../src/lib/types";

/**
 * U+FFFD, plus the signature UTF-8 leaves when decoded as Latin-1: a lead
 * byte in C2-C5 followed by a continuation byte, and the E2 80 smart-quote
 * sequence.
 *
 * Written with explicit escapes on purpose. The literal characters include
 * invisible C1 controls; an editor that strips them silently turns this into
 * a pattern matching bare latin letters, which would flag every correctly
 * decoded Turkish headline instead of catching a real problem.
 */
const MOJIBAKE = /\uFFFD|[\u00C2-\u00C5][\u0080-\u00BF]|\u00E2\u20AC/;

function pad(value: string | number, width: number): string {
  return String(value).padEnd(width);
}

/** Cut by code point, so an emoji at the boundary is not split into halves. */
function clip(text: string, width: number): string {
  const points = Array.from(text);
  return points.length <= width ? text : `${points.slice(0, width).join("")}…`;
}

function sample(items: readonly FeedItem[], sourceId: string, count: number): FeedItem[] {
  return items.filter((item) => item.sourceId === sourceId).slice(0, count);
}

async function main() {
  const started = Date.now();
  const { items, health } = await ingestFeeds({ cached: false });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`\nFetched ${SOURCES.length} feeds in ${elapsed}s\n`);

  console.log(`${pad("Source", 22)}${pad("Items", 7)}${pad("Status", 10)}Detail`);
  console.log("-".repeat(74));

  for (const feed of health) {
    const status = !feed.ok ? "FAILED" : feed.itemCount === 0 ? "EMPTY" : "ok";
    const dropped = feed.droppedAsOld ?? 0;
    const detail = feed.error ?? (dropped > 0 ? `${dropped} older than cutoff` : "");
    console.log(
      `${pad(feed.sourceName, 22)}${pad(feed.itemCount, 7)}${pad(status, 10)}${detail}`,
    );
  }

  const failing = health.filter((f) => !f.ok);
  const empty = health.filter((f) => f.ok && f.itemCount === 0);
  console.log(
    `\n${items.length} rows after dedupe · ${failing.length} failing · ${empty.length} empty`,
  );

  console.log("\nTopics");
  for (const topic of TOPICS) {
    const count = items.filter((item) => item.topic === topic.id).length;
    const share = items.length ? Math.round((count / items.length) * 100) : 0;
    const note = topic.id === "other" ? "  <- unclassified, tune against these" : "";
    console.log(`  ${pad(topic.label, 10)}${pad(count, 6)}${pad(`${share}%`, 6)}${note}`);
  }

  const noExcerpt = items.filter((item) => !item.excerpt).length;
  const longest = items.reduce((max, item) => Math.max(max, item.excerpt.length), 0);
  console.log(
    `\nExcerpts: ${items.length - noExcerpt} present, ${noExcerpt} absent · longest ${longest} chars (cap ${EXCERPT_LENGTH})`,
  );
  if (longest > EXCERPT_LENGTH) console.log("  ! An excerpt exceeded the cap.");

  // The feed where a charset mistake would show up first.
  console.log("\nEncoding check");
  for (const id of ["turkoyunsektoru"]) {
    const rows = sample(items, id, 3);
    const name = SOURCES.find((s) => s.id === id)?.name ?? id;

    if (rows.length === 0) {
      console.log(`  ${name}: no rows to check`);
      continue;
    }

    for (const row of rows) {
      const text = `${row.title} ${row.excerpt}`;
      const flag = MOJIBAKE.test(text) ? "MOJIBAKE" : "clean";
      console.log(`  [${flag}] ${name}: ${clip(row.title, 68)}`);
    }
  }

  const suspect = items.filter((item) => MOJIBAKE.test(`${item.title} ${item.excerpt}`));
  console.log(
    suspect.length === 0
      ? "\nNo mojibake detected in any row."
      : `\n! ${suspect.length} rows across all feeds look mis-decoded.`,
  );
  for (const row of suspect.slice(0, 5)) {
    console.log(`    ${row.sourceName}: ${clip(row.title, 60)}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
