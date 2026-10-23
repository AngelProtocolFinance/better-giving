import { Image } from "@better-giving/ui";

interface IOrgBanner {
  src: string | null | undefined;
  classes?: string;
}

/** the banner as uploaded: the editor crops it 4:1, so it is shown at 4:1 and
 * never cropped again. with no banner it is nothing, and the layout leads with
 * a brand band instead */
export function OrgBanner({ src, classes = "" }: IOrgBanner) {
  if (!src) return null;
  return (
    // overflow-hidden: a failed load swaps in the placeholder, whose square icon
    // would otherwise grow the strip to 2:1 inside a flex column (every main)
    <Image
      src={src}
      alt=""
      className={`aspect-4/1 w-full overflow-hidden object-cover ${classes}`}
    />
  );
}
