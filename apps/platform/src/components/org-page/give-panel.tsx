import type { Ref } from "react";
import type { INpoPublic } from "$/pg/queries/npo";
import { GroundContext, is_brand_ground, use_ground } from "./brand-band";
import { DonateButton } from "./donate";
import { OrgBanner } from "./org-banner";
import { RaisedStats } from "./raised-stats";

interface IGivePanel {
  /** the org's name, which names the panel */
  name: string;
  /** the 4:1 banner; none, and the panel starts at the figures */
  banner: string | null | undefined;
  raised: number;
  donors: number | null;
  target: INpoPublic["target"];
  donate_to: string;
  /** lg steps the figures up from md */
  figures: "md" | "lg";
  /** the hero Donate the header waits on */
  donate_ref?: Ref<HTMLAnchorElement>;
  classes?: string;
}

/** the banner, the figures and Donate on a light card. a media frame: the
 * banner bleeds to its edges, so the inset is the body's. inside, the ground is
 * the page's whatever band it sits on; on a brand band the fill is its edge */
export function GivePanel({
  name,
  banner,
  raised,
  donors,
  target,
  donate_to,
  figures,
  donate_ref,
  classes = "",
}: IGivePanel) {
  const edge = is_brand_ground(use_ground()) ? "" : "border";
  return (
    <aside
      aria-label={`Give to ${name}`}
      className={`flex flex-col overflow-hidden rounded bg-surface text-gray-12 ${edge} ${classes}`}
    >
      <GroundContext value="page">
        <OrgBanner src={banner} />
        <div className="flex flex-col gap-4 p-4 md:gap-5 md:p-6">
          <RaisedStats
            raised={raised}
            donors={donors}
            target={target}
            variant={figures === "lg" ? "card-lg" : "card"}
          />
          <DonateButton
            ref={donate_ref}
            to={donate_to}
            size="lg"
            classes="w-full"
          />
        </div>
      </GroundContext>
    </aside>
  );
}
