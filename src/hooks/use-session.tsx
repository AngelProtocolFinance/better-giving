import { useEffect } from "react";
import { useLocation } from "react-router";
import useSWR from "swr";

interface Session {
  signed_in: boolean;
  avatar_url?: string;
}

const fetcher = (url: string) =>
  fetch(url).then((r) => (r.ok ? r.json() : undefined));

// slim session state for chrome consumers — signed-in + avatar only.
// no bookmark/org logic; use use_user for that (bookmark-btn, org switcher).
export function use_session() {
  const {
    data: session,
    isLoading: is_loading,
    mutate,
  } = useSWR<Session | undefined>("/api/session", fetcher);

  // login/logout are server redirects that set the session cookie but land on
  // routes under the same layout — the header never unmounts, so SWR keeps its
  // stale in-memory session. revalidate on every settled navigation (keyed on
  // location.key) so cookie changes are reflected without a manual refresh.
  // swr dedupes within dedupingInterval, so rapid nav won't storm the probe.
  const { key } = useLocation();
  // biome-ignore lint/correctness/useExhaustiveDependencies: swr mutate is stable per key; run only on navigation
  useEffect(() => {
    mutate();
  }, [key]);

  /** revalidate session from server (e.g. after avatar change) */
  function revalidate() {
    mutate();
  }

  return { session, is_loading, revalidate };
}
