import { Arrow, Content, Tooltip } from "@better-giving/ui/tooltip";
import { Heart } from "lucide-react";
import { useState } from "react";
import { use_user } from "#/hooks/use-user";
import type { INpoBookmark } from "#/types/user";

interface IBookmarkBtn {
  npo: INpoBookmark;
  /** the button's box, ink and placement; the bare glyph-sized target unless
   * given */
  classes?: string;
  /** the heart's ink while it can't save yet (loading, logged out) */
  idle_ink?: string;
}

const focus_ring =
  "focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2";

export function BookmarkBtn({
  classes = "",
  npo,
  idle_ink = "text-gray-11",
}: IBookmarkBtn) {
  const { user, toggle_bookmark } = use_user();
  const [pending, set_pending] = useState(false);

  if (user === "loading") {
    return (
      <span aria-hidden className={`glyph-btn ${classes}`}>
        <Heart className={`icon-xl animate-pulse ${idle_ink}`} />
      </span>
    );
  }

  if (!user) {
    return (
      <Tooltip
        tip={
          <Content className="text-sm">
            Login to save your favorites
            <Arrow />
          </Content>
        }
      >
        <button
          type="button"
          aria-label="Add to favorites"
          className={`glyph-btn ${focus_ring} ${classes}`}
        >
          <Heart aria-hidden className={`icon-xl ${idle_ink}`} />
        </button>
      </Tooltip>
    );
  }

  const is_bookmarked = user.bookmarks.some((b) => b.id === npo.id);

  return (
    <Tooltip
      tip={
        !is_bookmarked ? (
          <Content className="text-sm">
            Add to favorites
            <Arrow />
          </Content>
        ) : null
      }
    >
      <button
        type="button"
        disabled={pending}
        aria-label="Add to favorites"
        className={`glyph-btn disabled:text-gray-11 ${focus_ring} ${classes}`}
        onClick={async () => {
          set_pending(true);
          await toggle_bookmark(npo, user);
          set_pending(false);
        }}
      >
        <Heart
          aria-hidden
          className={`icon-xl ${
            is_bookmarked ? "fill-destructive text-destructive" : ""
          }`}
        />
      </button>
    </Tooltip>
  );
}
