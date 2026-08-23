import { EmptyState } from "@better-giving/ui";
import { VideoPreview } from "#/pages/admin/media/video-preview";
import type { IPaginator } from "#/types/components";
import type { IMedia } from "@/npo";

interface Props extends IPaginator<IMedia> {}

export function List({ classes = "", ...props }: Props) {
  return (
    <div className={`${classes} grid @xl:grid-cols-2 @2xl:grid-cols-3 gap-4`}>
      {props.items.map((item) => (
        <VideoPreview key={item.id} {...item} />
      ))}
      {props.load_next && (
        <button
          disabled={props.disabled || props.loading}
          type="button"
          onClick={props.load_next}
          className="col-span-full btn-secondary btn"
        >
          {props.loading ? "Loading..." : "Load more videos"}
        </button>
      )}
    </div>
  );
}

interface INoVideo {
  classes?: string;
  /** the featured filter is on, so this is a query that came back empty
   *  rather than a profile with nothing on it */
  filtered?: boolean;
}

export function NoVideo({ classes = "", filtered }: INoVideo) {
  if (filtered)
    return <EmptyState classes={classes}>No featured videos found</EmptyState>;
  // no action of its own: the page header carries `Add Video` at all times, and
  // a second link with the same name a few rows below it is the same control
  // twice.
  return (
    <EmptyState classes={classes} heading="No videos yet">
      Your first one shows on your profile as soon as you add it.
    </EmptyState>
  );
}
