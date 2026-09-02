/**
 * Write every item that fell through to `other` to a file, for reading.
 *
 * Run with `npm run dump:unclassified`. Keyword lists should be tuned against
 * what these items actually say, not against a guess about what they say — so
 * the point of this script is to produce something you read, not a metric.
 *
 * It also lists the items each non-fallback bucket claimed, because a rule that
 * fires on the wrong item is a worse problem than one that does not fire, and
 * only reading the matches will show you that.
 */
import { writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { ingestFeeds } from "../src/lib/ingest";
import { TOPICS, classifyWithMatch } from "../src/lib/topics";
import type { FeedItem } from "../src/lib/types";

const OUT_DIR = join(process.cwd(), "reports");

function block(items: readonly FeedItem[]): string {
  return items
    .map((item) => `- [${item.sourceName}] ${item.title}\n    ${item.excerpt || "(no excerpt)"}`)
    .join("\n");
}

/** Same, annotated with the token that fired and where it fired. */
function blockWithHits(items: readonly FeedItem[]): string {
  return items
    .map((item) => {
      const { hit, inTitle } = classifyWithMatch(item.title, item.excerpt);
      const where = inTitle ? "title" : "EXCERPT ONLY";
      return `- "${hit}" (${where})  [${item.sourceName}] ${item.title}`;
    })
    .join("\n");
}

async function main() {
  const { items } = await ingestFeeds({ cached: false });

  const unmatched = items.filter((item) => !classifyWithMatch(item.title, item.excerpt).matched);

  const lines: string[] = [
    `Unclassified items — ${unmatched.length} of ${items.length} (${Math.round(
      (unmatched.length / items.length) * 100,
    )}%)`,
    `Generated ${new Date().toISOString()}`,
    "",
    "These matched no keyword in any bucket and fell through to `other`.",
    "Read them for clusters before adding keywords.",
    "",
    block(unmatched),
    "",
    "",
    "=== What each bucket claimed ===",
    "",
    "Each line shows the token that fired and whether it appeared in the title",
    "or only in the excerpt. A rule that fires on the wrong item is worse than",
    "one that does not fire at all, and EXCERPT ONLY is where those cluster.",
    "",
  ];

  let excerptOnly = 0;

  for (const topic of TOPICS) {
    if (topic.id === "other") continue;
    const claimed = items.filter((item) => item.topic === topic.id);
    excerptOnly += claimed.filter(
      (item) => !classifyWithMatch(item.title, item.excerpt).inTitle,
    ).length;
    lines.push(`--- ${topic.label} (${claimed.length}) ---`, blockWithHits(claimed), "");
  }

  const matched = items.length - unmatched.length;
  lines.splice(
    6,
    0,
    `Of ${matched} matched items, ${excerptOnly} fired on a token that appears only in the excerpt.`,
    "",
  );

  mkdirSync(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, "unclassified.txt");
  writeFileSync(path, lines.join("\n"), "utf8");

  console.log(`${unmatched.length} of ${items.length} items unclassified`);
  console.log(`Written to ${path}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
