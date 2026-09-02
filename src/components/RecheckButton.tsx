"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { recheckFeeds } from "@/app/actions";

/**
 * Re-fetch every feed now, rather than waiting out the 15 minute window.
 *
 * The label reports what happened afterwards, because the counts in the table
 * often come back identical — publishers do not post every quarter hour — and
 * without a word the button looks like it did nothing.
 */
export function RecheckButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  const run = () => {
    setDone(false);
    startTransition(async () => {
      await recheckFeeds();
      router.refresh();
      setDone(true);
    });
  };

  return (
    <span className="flex items-baseline gap-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="shrink-0 border border-rule-strong px-2 py-1 text-[13px] hover:bg-panel disabled:opacity-50"
      >
        {pending ? "Checking…" : "Check now"}
      </button>
      {done && !pending ? (
        <span className="text-[12px] text-meta" role="status">
          Feeds re-fetched
        </span>
      ) : null}
    </span>
  );
}
