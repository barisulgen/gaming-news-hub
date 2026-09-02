"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  addRead,
  loadHideRead,
  loadRead,
  loadSaved,
  persistSaved,
  removeRead,
  saveHideRead,
  saveRead,
  toggleSaved as toggleSavedLink,
} from "@/lib/readState";

/**
 * Read-state, saved items and the hide-read toggle, all persisted in
 * localStorage.
 *
 * `hydrated` is false during the server render and the first client render, so
 * callers can hold off on dimming rows until the stored sets are known. Without
 * it, every row would render unread and then visibly restyle on hydration.
 */
export function useReadState() {
  const [links, setLinks] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [hideRead, setHideReadState] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setLinks(loadRead());
    setSaved(loadSaved());
    setHideReadState(loadHideRead());
    setHydrated(true);
  }, []);

  const readSet = useMemo(() => new Set(links), [links]);
  const savedSet = useMemo(() => new Set(saved), [saved]);

  const markRead = useCallback((link: string) => {
    setLinks((current) => {
      const next = addRead(current, link);
      if (next === current) return current;
      saveRead(next);
      return next;
    });
  }, []);

  const markUnread = useCallback((link: string) => {
    setLinks((current) => {
      const next = removeRead(current, link);
      if (next === current) return current;
      saveRead(next);
      return next;
    });
  }, []);

  const markAllRead = useCallback((allLinks: readonly string[]) => {
    setLinks((current) => {
      const next = allLinks.reduce<string[]>((acc, link) => addRead(acc, link), current);
      if (next === current) return current;
      saveRead(next);
      return next;
    });
  }, []);

  const toggleSaved = useCallback((link: string) => {
    setSaved((current) => {
      const next = toggleSavedLink(current, link);
      persistSaved(next);
      return next;
    });
  }, []);

  const setHideRead = useCallback((value: boolean) => {
    setHideReadState(value);
    saveHideRead(value);
  }, []);

  return {
    readSet,
    savedSet,
    hydrated,
    hideRead,
    setHideRead,
    markRead,
    markUnread,
    markAllRead,
    toggleSaved,
  };
}
