import { Arrow, Content, Tooltip } from "@better-giving/ui/tooltip";
import { Heart } from "lucide-react";
import { useState } from "react";
import { use_user } from "#/hooks/use-user";
import type { INpoBookmark } from "#/types/user";

type Props = {
  classes?: string;
  npo: INpoBookmark;
};

export function BookmarkBtn({ classes = "", npo }: Props) {
  const { user, toggle_bookmark } = use_user();
  const [pending, set_pending] = useState(false);

  if (user === "loading") {
    return (
      <Heart className={`${classes} text-gray-11 animate-pulse icon-xl`} />
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
        <Heart className={`${classes} text-gray-11 icon-xl`} />
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
        className={`glyph-btn disabled:text-gray-11 ${classes}`}
        onClick={async () => {
          set_pending(true);
          await toggle_bookmark(npo, user);
          set_pending(false);
        }}
      >
        <Heart
          className={`icon-xl ${
            is_bookmarked ? "fill-destructive text-destructive" : ""
          }`}
        />
      </button>
    </Tooltip>
  );
}
