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
const no_subscribe = () => () => {};

/** the viewer's local date (YYYY-MM-DD) once hydrated; on the server, the most permissive today for the `bound` it feeds. */
export function useViewerToday(bound: "min" | "max") {
  return useSyncExternalStore(no_subscribe, local_today, server_today[bound]);
}
