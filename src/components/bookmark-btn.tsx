import { Heart } from "lucide-react";
import { useState } from "react";
import { use_user } from "#/hooks/use-user";
import type { INpoBookmark } from "#/types/user";
import { Arrow, Content, Tooltip } from "./tooltip";

type Props = {
  classes?: string;
  npo: INpoBookmark;
};

export function BookmarkBtn({ classes = "", npo }: Props) {
  const { user, toggle_bookmark } = use_user();
  const [pending, set_pending] = useState(false);

  if (user === "loading") {
    return (
      <Heart size={19} className={`${classes} text-muted-fg animate-pulse`} />
    );
  }

  if (!user) {
    return (
      <Tooltip
        tip={
          <Content className="px-4 py-2 bg-popover outline outline-border text-popover-fg text-sm rounded shadow-lg">
            Login to save your favorites
            <Arrow />
          </Content>
        }
      >
        <Heart size={19} className={`${classes} text-muted-fg`} />
      </Tooltip>
    );
  }

  const is_bookmarked = user.bookmarks.some((b) => b.id === npo.id);

  return (
    <Tooltip
      tip={
        !is_bookmarked ? (
          <Content className="px-4 py-2 bg-popover outline outline-border text-popover-fg text-sm rounded shadow-lg">
            Add to favorites
            <Arrow />
          </Content>
        ) : null
      }
    >
      <button
        type="button"
        disabled={pending}
        aria-label="Add to favorites button"
        className={`flex items-center gap-1 disabled:text-muted-fg ${classes}`}
        onClick={async () => {
          set_pending(true);
          await toggle_bookmark(npo, user);
          set_pending(false);
        }}
      >
        <Heart
          size={19}
          className={is_bookmarked ? "fill-destructive text-destructive" : ""}
        />
      </button>
    </Tooltip>
  );
}
