import { to_usd } from "@better-giving/ui/helpers";
import { donor_noun, goal_amount } from "#/routes/org.$org.$campaign/format";
import type { INpoPublic } from "$/pg/queries/npo";
import { is_brand_ground, use_ground } from "./brand-band";
import { GoalBar } from "./goal-bar";

const FIRST_GIFT = "Be the first to give";

interface IRaisedStats {
  raised: number;
  /** null when the count is unavailable, and then left out */
  donors: number | null;
  /** the org's goal setting; no goal, no bar */
  target: INpoPublic["target"];
  /** the figures. size: inline (Card), stacked over a rule (Letter), card and
   * card-lg (the give panel) */
  variant: "inline" | "stacked" | "card" | "card-lg";
  classes?: string;
}

/** what the org has raised, and from how many; nothing raised yet asks for the
 * first gift instead. a goal adds the bar and the goal itself */
export function RaisedStats({
  raised,
  donors,
  target,
  variant,
  classes = "",
}: IRaisedStats) {
  // on a brand fill every line takes the band's ink: gray-11 is a page ink
  const muted = is_brand_ground(use_ground()) ? "" : "text-gray-11";
  const goal = goal_amount(target, raised);

  const figures =
    raised > 0 ? (
      <Figures
        variant={variant}
        raised={to_usd(raised)}
        donors={donors}
        muted={muted}
      />
    ) : (
      <p
        className={`font-bold ${variant.startsWith("card") ? "text-2xl" : "text-lg md:text-xl"}`}
      >
        {FIRST_GIFT}
      </p>
    );

  return (
    <div
      className={`flex flex-col gap-2 ${variant === "stacked" ? "border-t pt-3" : ""} ${classes}`}
    >
      {figures}
      {goal != null && (
        <>
          <GoalBar raised={raised} goal={goal} />
          <p className={`figures text-xs ${muted}`}>
            {to_usd(raised)} of {to_usd(goal)} goal
          </p>
        </>
      )}
    </div>
  );
}

interface IFigures {
  variant: IRaisedStats["variant"];
  raised: string;
  donors: number | null;
  muted: string;
}

/** the figure's size is the variant's; the pairs are the same everywhere */
const FIGURE: Record<IRaisedStats["variant"], string> = {
  inline: "text-lg md:text-xl",
  stacked: "text-2xl md:text-3xl",
  card: "text-2xl",
  "card-lg": "text-2xl md:text-3xl",
};

/** each stat a large figure over its small label, side by side */
function Figures({ variant, raised, donors, muted }: IFigures) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2">
      <Stat
        figure={raised}
        label="raised"
        size={FIGURE[variant]}
        muted={muted}
      />
      {donors != null && (
        <Stat
          figure={donors.toLocaleString("en-US")}
          label={donor_noun(donors)}
          size={FIGURE[variant]}
          muted={muted}
        />
      )}
    </div>
  );
}

interface IStat {
  figure: string;
  label: string;
  size: string;
  muted: string;
}

function Stat({ figure, label, size, muted }: IStat) {
  // the space is dropped by the flex column and kept for assistive tech
  return (
    <p className="flex flex-col gap-1">
      <strong className={`figures leading-none ${size}`}>{figure}</strong>{" "}
      <span className={`text-sm ${muted}`}>{label}</span>
    </p>
  );
}
