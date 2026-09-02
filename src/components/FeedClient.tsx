"use client";

import { useCallback, useMemo, useState } from "react";

import { EmptyState, type EmptyReason } from "@/components/EmptyState";
import { FeedRow } from "@/components/FeedRow";
import { Rail } from "@/components/Rail";
import { useReadState } from "@/components/useReadState";
import type { FeedItem, TopicId } from "@/lib/types";

type SortMode = "newest" | "oldest" | "source";

const SORT_OPTIONS: ReadonlyArray<{ value: SortMode; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "source", label: "Source, A to Z" },
];

interface Group {
  key: string;
  label: string;
  items: FeedItem[];
}

function matchesQuery(item: FeedItem, needle: string): boolean {
  if (!needle) return true;
  return (
    item.title.toLowerCase().includes(needle) ||
    item.excerpt.toLowerCase().includes(needle) ||
    item.sourceName.toLowerCase().includes(needle)
  );
}

function countBy<T extends string>(items: readonly FeedItem[], key: (item: FeedItem) => T) {
  const counts: Record<string, number> = {};
  for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
  return counts;
}

/** Group consecutive items, relying on the list already being sorted. */
function group(items: readonly FeedItem[], sort: SortMode): Group[] {
  const groups: Group[] = [];

  for (const item of items) {
    const key = sort === "source" ? item.sourceId : item.dayKey;
    const label = sort === "source" ? item.sourceName : item.dayLabel;
    const last = groups.at(-1);

    if (last?.key === key) last.items.push(item);
    else groups.push({ key, label, items: [item] });
  }

  return groups;
}

export function FeedClient({ items, updatedAt }: { items: FeedItem[]; updatedAt: string }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("newest");
  const [selectedTopics, setSelectedTopics] = useState<Set<TopicId>>(new Set());
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  // Deliberately not persisted, unlike hide read: coming back to a feed that
  // looks empty because a forgotten filter is on is a bad first impression.
  const [savedOnly, setSavedOnly] = useState(false);

  const {
    readSet,
    savedSet,
    hydrated,
    hideRead,
    setHideRead,
    markRead,
    markUnread,
    markAllRead,
    toggleSaved,
  } = useReadState();

  const needle = query.trim().toLowerCase();

  const searched = useMemo(
    () => items.filter((item) => matchesQuery(item, needle)),
    [items, needle],
  );

  // Rows still in play before the topic and source filters. Facet counts are
  // built from this, so each count answers "how many would I get if I picked
  // this", given everything else that is already on.
  const base = useMemo(() => {
    if (!hydrated) return searched;
    let out = searched;
    if (savedOnly) out = out.filter((item) => savedSet.has(item.link));
    if (hideRead) out = out.filter((item) => !readSet.has(item.link));
    return out;
  }, [searched, hydrated, savedOnly, savedSet, hideRead, readSet]);

  const topicCounts = useMemo(
    () =>
      countBy(
        selectedSources.size ? base.filter((i) => selectedSources.has(i.sourceId)) : base,
        (i) => i.topic,
      ),
    [base, selectedSources],
  );

  const sourceCounts = useMemo(
    () =>
      countBy(
        selectedTopics.size ? base.filter((i) => selectedTopics.has(i.topic)) : base,
        (i) => i.sourceId,
      ),
    [base, selectedTopics],
  );

  const visible = useMemo(() => {
    const filtered = base.filter(
      (item) =>
        (selectedTopics.size === 0 || selectedTopics.has(item.topic)) &&
        (selectedSources.size === 0 || selectedSources.has(item.sourceId)),
    );

    const sorted = [...filtered];
    if (sort === "newest") sorted.sort((a, b) => b.timestamp - a.timestamp);
    else if (sort === "oldest") sorted.sort((a, b) => a.timestamp - b.timestamp);
    else
      sorted.sort(
        (a, b) => a.sourceName.localeCompare(b.sourceName) || b.timestamp - a.timestamp,
      );

    return sorted;
  }, [base, selectedTopics, selectedSources, sort]);

  const groups = useMemo(() => group(visible, sort), [visible, sort]);

  const unreadCount = useMemo(
    () => items.reduce((total, item) => (readSet.has(item.link) ? total : total + 1), 0),
    [items, readSet],
  );

  /**
   * Saved items still present in this fetch. An item saved a week ago may have
   * rolled out of its feed, so this can be lower than the number of links in
   * storage — the count describes what "saved only" would actually show.
   */
  const savedCount = useMemo(
    () => items.reduce((total, item) => (savedSet.has(item.link) ? total + 1 : total), 0),
    [items, savedSet],
  );

  const filtersActive =
    selectedTopics.size > 0 ||
    selectedSources.size > 0 ||
    needle.length > 0 ||
    hideRead ||
    savedOnly;

  const toggleTopic = useCallback((topic: TopicId) => {
    setSelectedTopics((current) => {
      const next = new Set(current);
      if (!next.delete(topic)) next.add(topic);
      return next;
    });
  }, []);

  const toggleSource = useCallback((sourceId: string) => {
    setSelectedSources((current) => {
      const next = new Set(current);
      if (!next.delete(sourceId)) next.add(sourceId);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setSelectedTopics(new Set());
    setSelectedSources(new Set());
    setQuery("");
    setHideRead(false);
    setSavedOnly(false);
  }, [setHideRead]);

  const emptyReason = ((): EmptyReason | null => {
    if (visible.length > 0) return null;
    if (items.length === 0) return "no-feeds";
    if (savedOnly && savedCount === 0) return "no-saved";
    // Distinguish "hidden because read" from "filtered away": if turning off
    // hide read would bring rows back, say so specifically.
    if (hideRead && searched.some((item) => readSet.has(item.link))) {
      const wouldShow = searched.filter(
        (item) =>
          (selectedTopics.size === 0 || selectedTopics.has(item.topic)) &&
          (selectedSources.size === 0 || selectedSources.has(item.sourceId)),
      );
      if (wouldShow.length > 0) return "all-read";
    }
    if (needle) return "no-search-match";
    return "filtered-out";
  })();

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col lg:flex-row">
      <Rail
        topicCounts={topicCounts}
        sourceCounts={sourceCounts}
        selectedTopics={selectedTopics}
        selectedSources={selectedSources}
        onToggleTopic={toggleTopic}
        onToggleSource={toggleSource}
        hideRead={hideRead}
        onHideReadChange={setHideRead}
        savedOnly={savedOnly}
        onSavedOnlyChange={setSavedOnly}
        savedCount={savedCount}
        onReset={reset}
        filtersActive={filtersActive}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule-strong px-3 py-2">
          <label className="min-w-[180px] flex-1">
            <span className="sr-only">Search headlines, excerpts and sources</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search headlines, excerpts, sources"
              className="w-full border border-rule-strong bg-paper px-2 py-1 text-[13px] placeholder:text-meta/70"
            />
          </label>

          <label className="flex shrink-0 items-center gap-1.5 text-[13px] text-meta">
            <span>Sort</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortMode)}
              className="border border-rule-strong bg-paper px-1.5 py-1 text-[13px] text-ink"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <p className="tnum shrink-0 whitespace-nowrap text-[13px] text-meta">
            {hydrated ? `${unreadCount} unread of ${items.length}` : `${items.length} stories`}
            <span className="mx-1.5 text-rule-strong">·</span>
            <span>Updated {updatedAt}</span>
          </p>

          {/*
            The wording never changes, only the number, so the button cannot
            resize enough to reflow the header — which used to push the rail and
            the rest of the page around as filters narrowed the list. Tabular
            numerals keep digits equal width and the reserved min-width absorbs
            the rest.
          */}
          <button
            type="button"
            onClick={() => markAllRead(visible.map((item) => item.link))}
            disabled={visible.length === 0}
            className="tnum min-w-[132px] shrink-0 whitespace-nowrap text-right text-[13px] text-meta underline underline-offset-2 hover:text-ink disabled:no-underline disabled:opacity-40"
          >
            Mark {visible.length} as read
          </button>
        </div>

        {emptyReason ? (
          <EmptyState reason={emptyReason} />
        ) : (
          groups.map((entry) => (
            <section key={entry.key}>
              <h2 className="sticky top-0 z-10 border-b border-rule bg-panel px-3 py-1 text-[12px] font-medium text-meta">
                {entry.label}
                <span className="tnum ml-2 text-meta/70">{entry.items.length}</span>
              </h2>
              <ol>
                {entry.items.map((item) => (
                  <FeedRow
                    key={item.link}
                    item={item}
                    read={hydrated && readSet.has(item.link)}
                    saved={hydrated && savedSet.has(item.link)}
                    onRead={markRead}
                    onMarkUnread={markUnread}
                    onToggleSave={toggleSaved}
                  />
                ))}
              </ol>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
