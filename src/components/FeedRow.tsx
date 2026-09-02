"use client";

import { TOPIC_COLOUR, TOPIC_LABEL } from "@/lib/topics";
import type { FeedItem } from "@/lib/types";

interface FeedRowProps {
  item: FeedItem;
  read: boolean;
  saved: boolean;
  onRead: (link: string) => void;
  onMarkUnread: (link: string) => void;
  onToggleSave: (link: string) => void;
}

/**
 * Row controls are invisible until the row is hovered or the control itself is
 * focused, so a page of them stays quiet. They keep their space either way —
 * the column is a fixed width — so nothing reflows when they appear. Saved rows
 * show their control permanently, because that one is state rather than an
 * affordance.
 */
const CONTROL =
  "shrink-0 rounded-[2px] px-1 py-[1px] text-[12px] leading-[16px] text-meta hover:bg-rule hover:text-ink focus-visible:opacity-100 group-hover:opacity-100";

export function FeedRow({
  item,
  read,
  saved,
  onRead,
  onMarkUnread,
  onToggleSave,
}: FeedRowProps) {
  // The left border keeps full strength when read, so the colour spine down the
  // edge survives even once everything below it has been opened.
  const dim = read ? "opacity-45" : "";

  return (
    <li
      className="group border-l-[6px] border-b border-b-rule pl-3 hover:bg-panel"
      style={{ borderLeftColor: TOPIC_COLOUR[item.topic] }}
    >
      {/* On mobile the meta pair sits above the headline; from sm up it becomes
          two aligned gutter columns. `contents` cannot carry opacity, so each
          child takes the dim class itself. */}
      <div className="grid gap-x-3 py-[7px] pr-3 sm:grid-cols-[46px_124px_1fr_104px]">
        <div className="flex gap-2 sm:contents">
          <time
            dateTime={item.timestamp ? new Date(item.timestamp).toISOString() : undefined}
            className={`read-fade tnum text-[12px] leading-[19px] text-meta sm:text-right ${dim}`}
          >
            {item.time}
          </time>
          <span
            className={`read-fade truncate text-[12px] leading-[19px] text-meta ${dim}`}
            title={item.sourceName}
          >
            {item.sourceName}
          </span>
        </div>

        <div className="min-w-0">
          <a
            href={item.link}
            target="_blank"
            rel="noopener"
            onClick={() => onRead(item.link)}
            className={`read-fade block font-display text-[15px] leading-[21px] hover:underline ${dim}`}
          >
            {item.title}
          </a>
          {item.excerpt ? (
            <p className={`read-fade truncate text-[13px] leading-[19px] text-excerpt ${dim}`}>
              {item.excerpt}
            </p>
          ) : null}
          <span className="sr-only">Topic: {TOPIC_LABEL[item.topic]}</span>
        </div>

        <div className="mt-1 flex items-start justify-end gap-1 sm:mt-0">
          <button
            type="button"
            onClick={() => onToggleSave(item.link)}
            aria-pressed={saved}
            className={`${CONTROL} ${saved ? "text-ink opacity-100" : "opacity-0"}`}
          >
            {saved ? "Saved" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => onMarkUnread(item.link)}
            // Hidden rather than disabled when the row is already unread: there
            // is nothing to undo, and an inert control invites a pointless click.
            className={`${CONTROL} opacity-0 ${read ? "" : "invisible"}`}
          >
            Unread
          </button>
        </div>
      </div>
    </li>
  );
}
