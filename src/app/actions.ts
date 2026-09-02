"use server";

import { revalidatePath, updateTag } from "next/cache";

import { FEEDS_TAG } from "@/lib/sources";

/**
 * Drop the cached feed responses and re-render both tabs.
 *
 * Expiring the tag is the part that matters: without it the pages would rebuild
 * from the still-cached fetch responses and report identical counts, making the
 * button look broken. `updateTag` rather than `revalidateTag` because only the
 * former expires immediately with read-your-own-writes semantics — the render
 * that follows this action has to see the new data, not the next visitor's.
 *
 * The Feed tab is revalidated too, since both tabs share one set of fetches.
 */
export async function recheckFeeds(): Promise<void> {
  updateTag(FEEDS_TAG);
  revalidatePath("/");
}
