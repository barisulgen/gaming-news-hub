/**
 * Read-state lives entirely in localStorage. There is no account and no server
 * record of what anyone has read.
 */
const READ_KEY = "mgnh.read.v1";
const HIDE_READ_KEY = "mgnh.hideRead.v1";
const SAVED_KEY = "mgnh.saved.v1";

/** Maximum links retained. Beyond this the oldest are dropped. */
export const READ_CAP = 2000;

/**
 * Saved links are capped too, but far lower. Saving is a deliberate act, so
 * dropping one is worse than dropping a read marker — the cap is high enough
 * that reaching it means the list has stopped being a shortlist.
 */
export const SAVED_CAP = 500;

/**
 * Append a link to the read list, oldest first, capped.
 *
 * An already-read link is left where it is rather than moved to the end, so the
 * list stays a record of when things were first read.
 */
export function addRead(existing: readonly string[], link: string): string[] {
  if (existing.includes(link)) return existing as string[];
  return capRead([...existing, link]);
}

/** Remove a link, so a row goes back to counting as unread. */
export function removeRead(existing: readonly string[], link: string): string[] {
  if (!existing.includes(link)) return existing as string[];
  return existing.filter((entry) => entry !== link);
}

/** Drop from the front, which is the oldest end, until within the cap. */
export function capRead(links: readonly string[]): string[] {
  return links.length <= READ_CAP ? (links as string[]) : links.slice(links.length - READ_CAP);
}

/** Add if absent, remove if present. Additions go to the end, newest last. */
export function toggleSaved(existing: readonly string[], link: string): string[] {
  if (existing.includes(link)) return existing.filter((entry) => entry !== link);
  const next = [...existing, link];
  return next.length <= SAVED_CAP ? next : next.slice(next.length - SAVED_CAP);
}

export function loadRead(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(READ_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return capRead(parsed.filter((entry): entry is string => typeof entry === "string"));
  } catch {
    // Corrupt or unavailable storage (private mode, quota) starts from empty
    // rather than breaking the page.
    return [];
  }
}

export function saveRead(links: readonly string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(READ_KEY, JSON.stringify(capRead(links)));
  } catch {
    // Nothing useful to do if storage is full or blocked.
  }
}

export function loadSaved(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SAVED_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string").slice(-SAVED_CAP);
  } catch {
    return [];
  }
}

export function persistSaved(links: readonly string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SAVED_KEY, JSON.stringify(links.slice(-SAVED_CAP)));
  } catch {
    // Nothing useful to do if storage is full or blocked.
  }
}

export function loadHideRead(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(HIDE_READ_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveHideRead(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HIDE_READ_KEY, String(value));
  } catch {
    // Ignored, as above.
  }
}
