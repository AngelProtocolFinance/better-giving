import { Image } from "@better-giving/ui";
import { to_usd } from "@better-giving/ui/helpers";
import { Link } from "react-router";
import { GoalBar } from "./goal-bar";
import { ends_label, type IGiveItem } from "./items";

/** how the card sits in its list.
 * - `vertical`: a third of a row; the 4:1 image across the top.
 * - `horizontal`: a half, or a row in a reading column; from md the image is
 *   the left 2/5 and the text beside it.
 * - `feature`: a lone item across the whole row, laid out as `horizontal`,
 *   with room for its excerpt.
 * - `tile`: a swipe row's fixed-width cards, image on top.
 * a phone always has the image on top. */
export type TCardOrientation = "vertical" | "horizontal" | "feature" | "tile";

export interface IGiveCard {
  item: IGiveItem;
  orientation: TCardOrientation;
  /** epoch ms the end date counts down from: the loader's clock, so the
   * server render and hydration agree */
  now: number;
  classes?: string;
}

const KIND: Record<IGiveItem["kind"], string> = {
  campaign: "Campaign",
  supporter: "Supporter campaign",
};

/** a campaign or supporter campaign. the title is the card's one link, stretched over
 * it, so the link's name stays the title. the progress line sits on the
 * card's bottom edge, so neighbours in a row align with or without an end
 * date */
export function GiveCard({ item, orientation, now, classes = "" }: IGiveCard) {
  const feature = orientation === "feature";
  const beside = feature || orientation === "horizontal";
  const ends = ends_label(item.ends_at, now);
  return (
    <article
      className={`relative grid h-full grid-rows-[auto_1fr] overflow-hidden rounded border bg-panel text-gray-12 has-[h3_a:focus-visible]:outline-2 has-[h3_a:focus-visible]:outline-ring has-[h3_a:focus-visible]:-outline-offset-2 ${beside ? "md:grid-cols-[2fr_3fr] md:grid-rows-1" : ""} ${classes}`}
    >
      <ImageFrame src={item.image} classes={beside ? "md:self-start" : ""} />
      <div className="flex min-w-0 flex-col gap-2 p-4">
        <p className="eyebrow text-primary">{KIND[item.kind]}</p>
        <h3 className={`font-bold ${feature ? "md:text-xl" : ""}`}>
          <Link
            to={item.to}
            className="outline-0 after:absolute after:inset-0 after:content-['']"
          >
            {item.title}
          </Link>
        </h3>
        {item.byline && (
          <p className="truncate text-sm text-gray-11">{item.byline}</p>
        )}
        {feature && item.excerpt && (
          <p className="line-clamp-2 text-sm text-gray-11">{item.excerpt}</p>
        )}
        {ends && <p className="text-sm font-semibold">{ends}</p>}
        <div className="mt-auto flex flex-col gap-2 pt-1">
          <Progress title={item.title} raised={item.raised} goal={item.goal} />
        </div>
      </div>
    </article>
  );
}

interface IImageFrame {
  src: string | null;
  classes?: string;
}

/** the 4:1 slot, the image as uploaded filling it exactly, so nothing is
 * re-cropped; with no image the fill is the frame. its width is the caller's:
 * a grid cell stretches it to the column */
export function ImageFrame({ src, classes = "" }: IImageFrame) {
  return (
    <div className={`aspect-4/1 bg-gray-3 ${classes}`}>
      {src && <Image src={src} alt="" className="size-full object-cover" />}
    </div>
  );
}

interface IProgress {
  title: string;
  raised: number;
  goal: number | null;
}

/** the bar and "$raised of $goal" with a goal; "$raised raised" without one */
export function Progress({ title, raised, goal }: IProgress) {
  if (goal == null) {
    return <p className="text-sm text-gray-11">{to_usd(raised)} raised</p>;
  }
  return (
    <>
      <GoalBar raised={raised} goal={goal} label={`${title}: amount raised`} />
      <p className="text-sm text-gray-11">
        {to_usd(raised)} of {to_usd(goal)}
      </p>
    </>
  );
}
