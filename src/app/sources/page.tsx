import { RecheckButton } from "@/components/RecheckButton";
import { ingestFeeds } from "@/lib/ingest";
import { EMAIL_SOURCES, MANUAL_SOURCES, MAX_AGE_DAYS } from "@/lib/sources";
import { formatTime } from "@/lib/time";
import type { FeedHealth, ManualSource } from "@/lib/types";

export const revalidate = 900;

function Launcher({
  title,
  note,
  sources,
}: {
  title: string;
  note: string;
  sources: readonly ManualSource[];
}) {
  return (
    <section className="mb-7">
      <h2 className="font-display text-[16px] font-medium">{title}</h2>
      <p className="mb-2 mt-0.5 text-[13px] text-meta">{note}</p>
      <ul className="border-t border-rule">
        {sources.map((source) => (
          <li key={source.url} className="border-b border-rule">
            <a
              href={source.url}
              target="_blank"
              rel="noopener"
              className="flex items-baseline justify-between gap-4 py-[7px] text-[14px] hover:bg-panel"
            >
              <span>
                {source.name}
                {source.note ? (
                  <span className="ml-2 text-[12px] text-meta">{source.note}</span>
                ) : null}
              </span>
              <span className="truncate text-[12px] text-meta">
                {source.url.replace(/^https?:\/\//, "")}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HealthRow({ feed }: { feed: FeedHealth }) {
  const dropped = feed.droppedAsOld ?? 0;
  const empty = feed.ok && feed.itemCount === 0;
  // A feed can be empty because it is broken or because everything it carries
  // is older than the cutoff. Only the first is a problem to chase.
  const emptyButStale = empty && dropped > 0;

  const status = !feed.ok
    ? "Failed"
    : emptyButStale
      ? "Nothing recent"
      : empty
        ? "No items"
        : "Healthy";
  const dot = !feed.ok ? "bg-bad" : empty ? "bg-warn" : "bg-good";

  return (
    <li className="grid grid-cols-[1fr_auto_auto] items-baseline gap-3 border-b border-rule py-[7px] text-[14px]">
      <div className="min-w-0">
        <a href={feed.url} target="_blank" rel="noopener" className="hover:underline">
          {feed.sourceName}
        </a>
        {feed.error ? <span className="ml-2 text-[12px] text-bad">{feed.error}</span> : null}
        {emptyButStale ? (
          <span className="ml-2 text-[12px] text-warn">
            Nothing in the last {MAX_AGE_DAYS} days
          </span>
        ) : null}
        {empty && !emptyButStale ? (
          <span className="ml-2 text-[12px] text-warn">Returned nothing</span>
        ) : null}
        {dropped > 0 && !empty ? (
          <span className="ml-2 text-[12px] text-meta">{dropped} older, hidden</span>
        ) : null}
      </div>
      <span className="tnum text-[13px] text-meta">{feed.itemCount}</span>
      <span aria-hidden className={`h-[9px] w-[9px] rounded-full ${dot}`} />
      <span className="sr-only">{status}</span>
    </li>
  );
}

export default async function SourcesPage() {
  const { health, fetchedAt } = await ingestFeeds();

  const failing = health.filter((feed) => !feed.ok).length;
  const emptyFeeds = health.filter((feed) => feed.ok && feed.itemCount === 0).length;

  return (
    <div className="mx-auto max-w-[860px] px-4 py-6">
      <Launcher
        title="Subscribe by email"
        note="No RSS found, reachable by newsletter."
        sources={EMAIL_SOURCES}
      />

      <Launcher
        title="Check manually"
        note="Publishes reports, not an article stream, except where noted."
        sources={MANUAL_SOURCES}
      />

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h2 className="font-display text-[16px] font-medium">Feed health</h2>
          <RecheckButton />
        </div>
        <p className="mb-2 mt-0.5 text-[14px] text-meta">
          Items kept from the last fetch at {formatTime(fetchedAt)}, limited to the last{" "}
          {MAX_AGE_DAYS} days and capped at 10 per source.{" "}
          {failing > 0 || emptyFeeds > 0
            ? `${failing} failing, ${emptyFeeds} with nothing to show.`
            : "All feeds responding."}
        </p>
        <ul className="border-t border-rule">
          {health.map((feed) => (
            <HealthRow key={feed.sourceId} feed={feed} />
          ))}
        </ul>
      </section>
    </div>
  );
}
