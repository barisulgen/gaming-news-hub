const TIME_ZONE = "Europe/Istanbul";

/** Sentinel day key for items whose feed carried no parseable date. */
const UNDATED_KEY = "0000-00-00";

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** en-CA renders as YYYY-MM-DD, which sorts lexically as well as temporally. */
const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dayLabelFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
});

const dayLabelWithYearFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function formatTime(timestamp: number): string {
  if (!timestamp) return "—";
  return timeFormatter.format(timestamp);
}

export function formatDayKey(timestamp: number): string {
  if (!timestamp) return UNDATED_KEY;
  return dayKeyFormatter.format(timestamp);
}

/**
 * A heading for one day's rows, relative to `now`.
 *
 * "Today" and "Yesterday" are resolved against the moment the page was
 * rendered. Because the page is cached for 15 minutes, a heading rendered just
 * before midnight can read "Today" for up to 15 minutes after it stops being
 * true; the next revalidation corrects it.
 */
export function formatDayLabel(timestamp: number, now: number = Date.now()): string {
  if (!timestamp) return "No date";

  const key = formatDayKey(timestamp);
  const todayKey = formatDayKey(now);
  if (key === todayKey) return "Today";

  const yesterdayKey = formatDayKey(now - 86_400_000);
  if (key === yesterdayKey) return "Yesterday";

  const sameYear = key.slice(0, 4) === todayKey.slice(0, 4);
  return sameYear
    ? dayLabelFormatter.format(timestamp)
    : dayLabelWithYearFormatter.format(timestamp);
}
