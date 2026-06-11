import { Image } from "lucide-react";
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
          className="col-span-full btn-secondary btn text-sm py-3"
        >
          {props.loading ? "Loading..." : "Load more videos"}
        </button>
      )}
    </div>
  );
}

export function NoVideo({ classes = "" }) {
  return (
    <div
      className={`bg-card ${classes} grid justify-items-center rounded border px-4 py-16`}
    >
      <Image className="text-muted-fg mb-6" />
      <p className="font-bold mb-2">Start by adding your first video</p>
      <p className="text-sm text-muted-fg">
        You have no videos. To add one, use the{" "}
        <span className="font-bold">Add video</span> button above.
      </p>
    </div>
  );
}
