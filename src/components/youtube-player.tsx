// extracts video id from youtube.com/watch, youtu.be, and embed urls
export function extract_youtube_id(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?.*v=|embed\/)|youtu\.be\/|youtube-nocookie\.com\/embed\/)([a-zA-Z0-9_-]{11})/
  );
  return match?.[1] ?? null;
}

interface IYouTubePlayer {
  url: string;
  className?: string;
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
  if (!id) return null;

  const style = "absolute inset-0 size-full";

  if ("thumbnail" in props && props.thumbnail) {
    return (
      <img
        className={`${style} object-cover ${props.className ?? ""}`}
        src={`https://img.youtube.com/vi/${id}/hqdefault.jpg`}
        alt=""
        loading="lazy"
      />
    );
  }

  const controls = props.controls ?? true;
  return (
    <iframe
      className={`${style} ${props.className ?? ""}`}
      src={`https://www.youtube-nocookie.com/embed/${id}${controls ? "" : "?controls=0"}`}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      title="YouTube video"
      loading="lazy"
    />
  );
}
