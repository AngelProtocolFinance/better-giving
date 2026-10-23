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
    <Image
      src={src}
      alt=""
      className={`aspect-4/1 w-full object-cover ${classes}`}
    />
  );
}
