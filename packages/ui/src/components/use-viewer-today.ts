import { useSyncExternalStore } from "react";

const HOUR = 3_600_000;
const iso_at_offset = (hours: number) =>
  new Date(Date.now() + hours * HOUR).toISOString().slice(0, 10);
const local_today = () => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};
// a server render has no viewer zone, so it falls back to the date that clamps
// nothing still valid for any viewer: the earliest today on earth (UTC−12) for
// a lower bound, the latest (UTC+14) for an upper one.
const server_today = {
  min: () => iso_at_offset(-12),
  max: () => iso_at_offset(14),
};
// chromium pauses timers through OS sleep, so a laptop that sleeps past
// midnight wakes with the timer still pending: the wake-up events re-read the
// date and re-arm from the clock. the timeout covers a tab left open and awake.
const WINDOW_WAKE = ["focus", "pageshow"] as const;

const subscribe_midnight = (on_change: () => void) => {
  let timer: ReturnType<typeof setTimeout>;
  const arm = () => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    timer = setTimeout(reread, next.getTime() - now.getTime());
  };
  const reread = () => {
    clearTimeout(timer);
    on_change();
    arm();
  };
  arm();
  for (const e of WINDOW_WAKE) window.addEventListener(e, reread);
  document.addEventListener("visibilitychange", reread);
  return () => {
    clearTimeout(timer);
    for (const e of WINDOW_WAKE) window.removeEventListener(e, reread);
    document.removeEventListener("visibilitychange", reread);
  };
};

/** the viewer's local date (YYYY-MM-DD) once hydrated, rolling over at local midnight; on the server, the most permissive today for the `bound` it feeds. */
export function useViewerToday(bound: "min" | "max") {
  return useSyncExternalStore(
    subscribe_midnight,
    local_today,
    server_today[bound]
  );
}
