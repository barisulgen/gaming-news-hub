import { FeedClient } from "@/components/FeedClient";
import { ingestFeeds } from "@/lib/ingest";
import { formatTime } from "@/lib/time";

// Next requires a literal here, so this cannot read REVALIDATE_SECONDS from
// lib/sources. Keep the two in step when changing the cache window.
export const revalidate = 900;

export default async function FeedPage() {
  const { items, fetchedAt } = await ingestFeeds();

  return <FeedClient items={items} updatedAt={formatTime(fetchedAt)} />;
}
