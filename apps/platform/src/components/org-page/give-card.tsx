import { Image } from "@better-giving/ui";
import { to_usd } from "@better-giving/ui/helpers";
import { Link } from "react-router";
import { GoalBar } from "./goal-bar";
import { ends_label, type IGiveItem } from "./items";

/** how the card sits in its list. the 4:1 image is always on top at the
 * card's full width: beside the text, a 4:1 slot is shorter than the text at
 * every width these lists reach.
 * - `vertical`: a third of a row; a stacked card on a phone.
 * - `horizontal`: a half.
 * - `feature`: a lone item across the whole row, with room for its excerpt.
 * - `tile`: a swipe row's fixed-width cards. */
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
 * it, so the link's name stays the title */
export function GiveCard({ item, orientation, now, classes = "" }: IGiveCard) {
  const feature = orientation === "feature";
  const ends = ends_label(item.ends_at, now);
  return (
    <article
      className={`relative grid h-full grid-rows-[auto_1fr] overflow-hidden rounded border bg-panel text-gray-12 has-[h3_a:focus-visible]:outline-2 has-[h3_a:focus-visible]:outline-ring has-[h3_a:focus-visible]:-outline-offset-2 ${classes}`}
    >
      <ImageFrame src={item.image} />
      <div
        className={`flex min-w-0 flex-col gap-2 p-4 ${feature ? "md:gap-3 md:p-6" : ""}`}
      >
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
          <p className="line-clamp-2 text-sm text-gray-11 max-md:hidden">
            {item.excerpt}
          </p>
        )}
        <div className="mt-auto flex flex-col gap-2 pt-1">
          <Progress
            title={item.title}
            raised={item.raised}
            goal={item.goal}
            classes={feature ? "md:max-w-sm" : ""}
          />
          {ends && <p className="text-sm font-semibold">{ends}</p>}
        </div>
      </div>
    </article>
  );
}

interface IImageFrame {
  src: string | null;
  classes?: string;
}

/** the 4:1 slot across the card's full width, and the image as uploaded
 * filling it exactly, so nothing is re-cropped; with no image the fill is the
 * frame */
export function ImageFrame({ src, classes = "" }: IImageFrame) {
  return (
    <div className={`aspect-4/1 w-full bg-gray-3 ${classes}`}>
      {src && <Image src={src} alt="" className="size-full object-cover" />}
    </div>
  );
}

interface IProgress {
  title: string;
  raised: number;
  goal: number | null;
  classes?: string;
}

/** the bar and "$raised of $goal" with a goal; "$raised raised" without one */
export function Progress({ title, raised, goal, classes = "" }: IProgress) {
  if (goal == null) {
    return <p className="text-sm text-gray-11">{to_usd(raised)} raised</p>;
  }
  return (
    <>
      <GoalBar
        raised={raised}
        goal={goal}
        label={`${title}: amount raised`}
        classes={classes}
      />
      <p className="text-sm text-gray-11">
        {to_usd(raised)} of {to_usd(goal)}
      </p>
    </>
  );
}
