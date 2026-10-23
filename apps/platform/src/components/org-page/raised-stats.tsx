import { to_usd } from "@better-giving/ui/helpers";
import {
  donor_noun,
  goal_amount,
  percent_label,
} from "#/routes/org.$org.$campaign/format";
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
  /** inline: Poster, Hub. stacked, over a rule: Letter. panel: Feature's give
   * panel, the figure large over its line */
  variant: "inline" | "stacked" | "panel";
  classes?: string;
}

/** what the org has raised, and from how many; nothing raised yet asks for the
 * first gift instead. a goal adds the bar and how far along it is */
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
        className={`font-bold ${variant === "panel" ? "text-2xl" : "text-lg md:text-xl"}`}
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
          <p className={`text-xs ${muted}`}>
            {percent_label(raised, goal)} of {to_usd(goal)} goal
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

function Figures({ variant, raised, donors, muted }: IFigures) {
  const count = donors?.toLocaleString("en-US");
  if (variant === "panel") {
    return (
      <p className="flex flex-col gap-1">
        <strong className="text-3xl leading-none">{raised}</strong>
        <span className={`text-sm ${muted}`}>
          {donors != null
            ? `raised from ${count} ${donor_noun(donors)}`
            : "raised"}
        </span>
      </p>
    );
  }
  if (variant === "stacked") {
    return (
      <p className="flex flex-wrap gap-x-7 gap-y-1">
        <span>
          <strong className="text-2xl md:text-3xl">{raised}</strong>{" "}
          <span className={muted}>raised</span>
        </span>
        {donors != null && (
          <span>
            <strong className="text-2xl md:text-3xl">{count}</strong>{" "}
            <span className={muted}>{donor_noun(donors)}</span>
          </span>
        )}
      </p>
    );
  }
  return (
    <p className="text-sm md:text-base">
      <strong className="text-lg md:text-xl">{raised}</strong> raised
      {donors != null && (
        <>
          {" · "}
          <strong className="text-lg md:text-xl">{count}</strong>{" "}
          {donor_noun(donors)}
        </>
      )}
    </p>
  );
}

/** the pinned bar's one line: the first-gift ask, how far along the goal, or
 * the amount raised */
export function raised_summary(
  raised: number,
  target: INpoPublic["target"]
): string {
  if (!(raised > 0)) return FIRST_GIFT;
  const goal = goal_amount(target, raised);
  if (goal != null) return `${percent_label(raised, goal)} of goal`;
  return `${to_usd(raised)} raised`;
}
