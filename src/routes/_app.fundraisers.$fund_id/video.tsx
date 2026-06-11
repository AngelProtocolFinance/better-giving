import { YouTubePlayer } from "#/components/youtube-player";

interface IVideo {
  classes?: string;
  url: string;
}
export function Video(props: IVideo) {
  return (
    <div className="relative pt-[56.25%] aspect-16/9 rounded overflow-clip">
      <YouTubePlayer url={props.url} />
    </div>
  );
}
