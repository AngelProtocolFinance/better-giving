import { YouTubePlayer } from "#/components/youtube-player";
import type { IMedia } from "@/npo";

export function Media({ media }: { media: IMedia[] }) {
  return (
    <div className="w-full h-full px-8 py-10 grid sm:grid-cols-[repeat(auto-fill,minmax(373px,1fr))] gap-8">
      {media.map((m) => (
        <Medium {...m} key={m.id} />
      ))}
    </div>
  );
}

function Medium(props: IMedia) {
  return (
    <div className="relative pt-[56.25%] aspect-16/9 rounded overflow-clip">
      <YouTubePlayer url={props.url} />
    </div>
  );
}
