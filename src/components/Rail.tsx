"use client";

import { SOURCES } from "@/lib/sources";
import { TOPICS, TOPIC_COLOUR } from "@/lib/topics";
import type { TopicId } from "@/lib/types";

interface RailProps {
  topicCounts: Record<string, number>;
  sourceCounts: Record<string, number>;
  selectedTopics: Set<TopicId>;
  selectedSources: Set<string>;
  onToggleTopic: (topic: TopicId) => void;
  onToggleSource: (sourceId: string) => void;
  hideRead: boolean;
  onHideReadChange: (value: boolean) => void;
  savedOnly: boolean;
  onSavedOnlyChange: (value: boolean) => void;
  savedCount: number;
  onReset: () => void;
  filtersActive: boolean;
}

function Count({ value }: { value: number }) {
  return <span className="tnum text-[12px] text-meta">{value}</span>;
}

export function Rail({
  topicCounts,
  sourceCounts,
  selectedTopics,
  selectedSources,
  onToggleTopic,
  onToggleSource,
  hideRead,
  onHideReadChange,
  savedOnly,
  onSavedOnlyChange,
  savedCount,
  onReset,
  filtersActive,
}: RailProps) {
  return (
    <aside className="shrink-0 border-b border-rule-strong px-4 py-3 lg:w-[228px] lg:border-b-0 lg:border-r lg:px-0 lg:pl-4 lg:pr-3">
      <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3 lg:grid-cols-1 lg:gap-y-5">
        <section>
          <h2 className="mb-1.5 text-[12px] font-medium text-meta">Topic</h2>
          <ul className="space-y-px">
            {TOPICS.map((topic) => {
              const selected = selectedTopics.has(topic.id);
              return (
                <li key={topic.id}>
                  <button
                    type="button"
                    onClick={() => onToggleTopic(topic.id)}
                    aria-pressed={selected}
                    className={`flex w-full items-center gap-2 py-[3px] pr-1 text-left text-[13px] ${
                      selected ? "font-medium text-ink" : "text-ink/75 hover:text-ink"
                    }`}
                  >
                    <span
                      aria-hidden
                      className="h-[14px] w-[6px] shrink-0"
                      style={{
                        backgroundColor: TOPIC_COLOUR[topic.id],
                        opacity: selected || selectedTopics.size === 0 ? 1 : 0.35,
                      }}
                    />
                    <span className="flex-1 truncate">{topic.label}</span>
                    <Count value={topicCounts[topic.id] ?? 0} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="col-span-2 sm:col-span-1">
          <h2 className="mb-1.5 text-[12px] font-medium text-meta">Source</h2>
          <ul className="space-y-px">
            {SOURCES.map((source) => {
              const selected = selectedSources.has(source.id);
              const count = sourceCounts[source.id] ?? 0;
              return (
                <li key={source.id}>
                  <button
                    type="button"
                    onClick={() => onToggleSource(source.id)}
                    aria-pressed={selected}
                    className={`flex w-full items-center gap-2 py-[3px] pr-1 text-left text-[13px] ${
                      selected ? "font-medium text-ink" : "text-ink/75 hover:text-ink"
                    } ${count === 0 ? "opacity-50" : ""}`}
                  >
                    <span className="flex-1 truncate">{source.name}</span>
                    <Count value={count} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="col-span-2 sm:col-span-1 lg:col-span-1">
          <h2 className="mb-1.5 text-[12px] font-medium text-meta">View</h2>
          <label className="flex cursor-pointer items-center gap-2 py-[3px] text-[13px]">
            <input
              type="checkbox"
              checked={hideRead}
              onChange={(event) => onHideReadChange(event.target.checked)}
              className="h-[14px] w-[14px] accent-[#1b2b3d]"
            />
            Hide read
          </label>
          <label className="flex cursor-pointer items-center gap-2 py-[3px] text-[13px]">
            <input
              type="checkbox"
              checked={savedOnly}
              onChange={(event) => onSavedOnlyChange(event.target.checked)}
              className="h-[14px] w-[14px] accent-[#1b2b3d]"
            />
            <span className="flex-1">Saved only</span>
            <Count value={savedCount} />
          </label>
          {filtersActive ? (
            <button
              type="button"
              onClick={onReset}
              className="mt-1.5 text-[13px] text-meta underline underline-offset-2 hover:text-ink"
            >
              Reset filters
            </button>
          ) : null}
        </section>
      </div>
    </aside>
  );
}
