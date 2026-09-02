export type EmptyReason =
  | "no-feeds"
  | "all-read"
  | "no-saved"
  | "no-search-match"
  | "filtered-out";

const MESSAGES: Record<EmptyReason, { headline: string; help: string }> = {
  "no-feeds": {
    headline: "No feeds returned anything this cycle.",
    help: "Open the Sources tab to see which ones failed and why.",
  },
  "all-read": {
    headline: "Everything here is read.",
    help: "Turn off hide read in the rail to bring these rows back.",
  },
  "no-saved": {
    headline: "Nothing saved yet.",
    help: "Hover a row and choose save to keep it here.",
  },
  "no-search-match": {
    headline: "Nothing matches that search.",
    help: "Try a shorter term, or clear the search box to see everything again.",
  },
  "filtered-out": {
    headline: "No stories in the topics and sources you picked.",
    help: "Pick another topic or source in the rail, or reset the filters.",
  },
};

export function EmptyState({ reason }: { reason: EmptyReason }) {
  const { headline, help } = MESSAGES[reason];

  return (
    <div className="px-4 py-16 text-center">
      <p className="font-display text-[17px]">{headline}</p>
      <p className="mt-1 text-[14px] text-meta">{help}</p>
    </div>
  );
}
