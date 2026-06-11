import { LoaderCircle, Minus, Pencil, Star } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { Link, useFetcher } from "react-router";
import { YouTubePlayer } from "#/components/youtube-player";
import type { IMedia } from "@/npo";

export function VideoPreview(props: IMedia) {
  const del = useFetcher({ key: `delete-${props.id}` });
  const feat = useFetcher({ key: `feature-${props.id}` });
  const allControlsDisabled =
    del.state === "submitting" || feat.state === "submitting";

  return (
    <div key={props.id}>
      <div className="flex items-center justify-end mb-1">
        <CRUDBtn
          id={props.id}
          name="intent"
          value="feature"
          aria-label={props.featured ? "unfeature" : "feature"}
          disabled={allControlsDisabled}
          featured={props.featured}
        >
          <Star
            size={19}
            className={`${
              props.featured ? "fill-[#FFA500] text-[#FFA500]" : ""
            } group-disabled:text-muted-fg group-disabled:fill-muted-fg`}
          />
        </CRUDBtn>
        <Link
          aria-label="edit"
          aria-disabled={allControlsDisabled}
          to={{
            pathname: props.id,
            search: new URLSearchParams({
              prev_url: props.url,
            }).toString(),
          }}
          className="p-1.5 text-lg rounded-full hover:bg-secondary group aria-disabled:text-muted-fg"
        >
          <Pencil size={16} />
        </Link>
        <CRUDBtn
          name="intent"
          value="delete"
          aria-label="delete"
          featured={props.featured}
          id={props.id}
          disabled={allControlsDisabled}
        >
          <Minus />
        </CRUDBtn>
      </div>
      {/** render only thumbnails on lists */}
      <div className="relative pt-[56.25%] aspect-16/9 rounded overflow-clip">
        <YouTubePlayer url={props.url} thumbnail />
      </div>
    </div>
  );
}

interface ICRUDBtn extends ButtonHTMLAttributes<HTMLButtonElement> {
  featured: boolean;
}
function CRUDBtn({ className, children, featured, ...props }: ICRUDBtn) {
  const fetcher = useFetcher({ key: `${props.value}-${props.id}` });
  return (
    <fetcher.Form method="POST" className="contents">
      <input type="hidden" name="featured" value={featured ? "1" : "0"} />
      <input type="hidden" name="mediaId" value={props.id} />
      <button
        type="submit"
        {...props}
        className={`p-1.5 text-lg rounded-full hover:bg-secondary group disabled:text-muted-fg group aria-disabled:text-muted-fg ${className}`}
      >
        {fetcher.state === "submitting" ? (
          <LoaderCircle className="animate-spin" />
        ) : (
          children
        )}
      </button>
    </fetcher.Form>
  );
}
