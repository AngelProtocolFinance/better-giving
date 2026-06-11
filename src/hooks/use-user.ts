import useSWR from "swr";
import type { PublicUser } from "#/types/auth";
import type { INpoBookmark } from "#/types/user";

const fetcher = (url: string) =>
  fetch(url).then((r) => (r.ok ? r.json() : undefined));

export function use_user() {
  const {
    data,
    isLoading: is_loading,
    mutate,
  } = useSWR<PublicUser | undefined>("/api/me", fetcher);

  const user: PublicUser | undefined | "loading" = is_loading
    ? "loading"
    : data;

  async function toggle_bookmark(npo: INpoBookmark, prev: PublicUser) {
    const is_saved = prev.bookmarks.some((b) => b.id === npo.id);
    const action = is_saved ? "delete" : "add";

    // optimistic update — no revalidate so other consumers don't flash
    const next: PublicUser = {
      ...prev,
      bookmarks: is_saved
        ? prev.bookmarks.filter((b) => b.id !== npo.id)
        : [...prev.bookmarks, npo],
    };
    mutate(next, { revalidate: false });

    const body = new FormData();
    body.set("intent", "toggle-bookmark");
    body.set("action", action);
    body.set("npo_id", String(npo.id));

    await fetch("/api/me", { method: "POST", body });
  }

  /** revalidate user data from server */
  function revalidate() {
    mutate();
  }

  return { user, toggle_bookmark, revalidate };
}
