import { Image } from "@better-giving/ui";
import { Link } from "react-router";
import { BookmarkBtn } from "#/components/bookmark-btn";
import type { INpoBookmark } from "#/types/user";

interface IOrgHeader {
  name: string;
  logo?: string | null;
  /** the org's profile */
  to: string;
  bookmark?: INpoBookmark;
}

/** the nonprofit's own masthead — its mark, not Better Giving's */
export function OrgHeader({ name, logo, to, bookmark }: IOrgHeader) {
  return (
    <header className="border-b bg-panel">
      <div className="page flex items-center justify-between gap-4 py-2">
        <Link
          to={to}
          className="flex min-h-11 min-w-0 items-center gap-3 font-bold text-gray-12"
        >
          {logo && (
            <Image
              src={logo}
              alt=""
              width={32}
              height={32}
              className="size-8 shrink-0 rounded object-cover"
            />
          )}
          <span className="truncate">{name}</span>
        </Link>
        {bookmark && <BookmarkBtn npo={bookmark} />}
      </div>
    </header>
  );
}
