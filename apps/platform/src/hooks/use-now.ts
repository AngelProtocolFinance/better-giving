import { useEffect, useRef, useState } from "react";

// re-armed hourly: past 2^31 ms setTimeout fires at once, and a timer stalled by sleep runs late by at most this
const MAX_DELAY_MS = 60 * 60 * 1000;

/**
 * The time to render by. The first render uses `loader_now` (the loader's ISO
 * time), so hydration matches the server's html; after mount it is the browser's
 * clock, never behind the loader's — a stale cached page catches up, a slow
 * clock can't reopen what the server closed. Re-renders once `until` passes.
 */
export function use_now(loader_now: string, until?: Date): Date {
  const [now, set_now] = useState(() => new Date(loader_now));
  const lead_ms = useRef(0);

  useEffect(() => {
    lead_ms.current = Math.max(0, Date.parse(loader_now) - Date.now());
    set_now(new Date(Date.now() + lead_ms.current));
  }, [loader_now]);

  const until_ms = until?.getTime();
  useEffect(() => {
    if (until_ms === undefined || now.getTime() >= until_ms) return;
    const delay = until_ms - (Date.now() + lead_ms.current);
    const id = setTimeout(
      () => set_now(new Date(Date.now() + lead_ms.current)),
      Math.min(Math.max(delay, 0), MAX_DELAY_MS)
    );
    return () => clearTimeout(id);
  }, [until_ms, now]);

  return now;
}
