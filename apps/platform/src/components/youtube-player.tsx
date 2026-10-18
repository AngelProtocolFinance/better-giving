import { useEffect, useRef, useState } from "react";

// extracts video id from youtube.com/watch, youtu.be, and embed urls
export function extract_youtube_id(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/)|youtu\.be\/|youtube-nocookie\.com\/embed\/)([a-zA-Z0-9_-]{11})/
  );
  return match?.[1] ?? null;
}

interface IYouTubePlayer {
  url: string;
  classes?: string;
  title?: string;
}

interface IYouTubeEmbed extends IYouTubePlayer {
  controls?: boolean;
  thumbnail?: never;
}

interface IYouTubeThumbnail extends IYouTubePlayer {
  thumbnail: true;
  controls?: never;
}

type YouTubePlayerProps = IYouTubeEmbed | IYouTubeThumbnail;

export function YouTubePlayer(props: YouTubePlayerProps) {
  const id = extract_youtube_id(props.url);
  const thumbnail = "thumbnail" in props && props.thumbnail === true;
  const controls = !thumbnail && (props.controls ?? true);
  const embed = id
    ? `https://www.youtube-nocookie.com/embed/${id}${controls ? "" : "?controls=0"}`
    : null;
  const frame = useRef<HTMLIFrameElement>(null);
  const [src, set_src] = useState<string | null>(null);

  // chrome's lazy margin fetches this embed while it is still below the fold,
  // and the frame stays transparent until that response paints. arm the src
  // at intersection so the request starts when the slot is on screen.
  useEffect(() => {
    if (!embed || thumbnail) return;
    const el = frame.current;
    if (!el) return;
    let stop = false;
    const arm = () => {
      if (!stop) set_src(embed);
    };
    if (typeof IntersectionObserver === "undefined") {
      arm();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        arm();
        io.disconnect();
      },
      { rootMargin: "200px 0px" }
    );
    io.observe(el);
    return () => {
      stop = true;
      io.disconnect();
    };
  }, [embed, thumbnail]);

  if (!id) return null;

  const style = "absolute inset-0 size-full";

  if (thumbnail) {
    return (
      <img
        className={`${style} object-cover ${props.classes ?? ""}`}
        src={`https://img.youtube.com/vi/${id}/hqdefault.jpg`}
        alt=""
        loading="lazy"
      />
    );
  }

  return (
    <iframe
      ref={frame}
      className={`${style} ${props.classes ?? ""}`}
      src={src ?? undefined}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      title={props.title ?? "YouTube video"}
      loading="lazy"
    />
  );
}
