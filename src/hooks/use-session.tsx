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

  /** revalidate session from server (e.g. after avatar change) */
  function revalidate() {
    mutate();
  }

  return { session, is_loading, revalidate };
}
