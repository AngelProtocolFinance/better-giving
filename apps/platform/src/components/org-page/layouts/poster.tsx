import { useState } from "react";
import { RichText, to_text } from "#/components/rich-text";
import { BrandBand } from "../brand-band";
import { DonateButton } from "../donate";
import { OrgBanner } from "../org-banner";
import { OrgMark } from "../org-mark";
import { OrgMeta } from "../org-meta";
import { OrgName } from "../org-name";
import { QuoteStrip } from "../quote-strip";
import { RaisedStats } from "../raised-stats";
import { OrgPageFrame } from "./org-page-frame";
import type { IOrgLayout } from "./types";
import { WaysToHelp } from "./ways-to-help";

/** a short story or none, and 0-3 items: the hero on the deep band is the
 * whole pitch, under the banner when there is one and leading the page when
 * not: the name, the tagline as its deck, the short story as the lead. whatever
 * there is to give to follows it in one row, then the donors' words */
export function Poster(props: IOrgLayout) {
  const { npo } = props;
  // the hero's Donate, which the header waits on before showing its own
  const [hero_donate, set_hero_donate] = useState<HTMLElement | null>(null);
  const has_story = !!to_text(npo.overview_pt).trim();
  const tagline = npo.tagline?.trim();

  return (
    <OrgPageFrame page={props} hero_donate={hero_donate}>
      <OrgBanner src={npo.image} />
      <BrandBand tone="deep" classes="py-8 md:py-12">
        <div className="page">
          <div className="flex max-w-3xl flex-col gap-4 md:gap-5">
            <div className="flex items-center gap-3 md:gap-4">
              <OrgMark name={npo.name} logo={npo.logo} size="md" ring />
              <OrgMeta npo={npo} credential={props.credential} />
            </div>
            <OrgName name={npo.name} scale="lg" />
            {tagline && (
              <p className="text-lg leading-snug md:text-2xl">{tagline}</p>
            )}
            {has_story && (
              <RichText
                readOnly
                content={{ value: npo.overview_pt }}
                // a story link keeps the band's ink: the editor's primary
                // link ink vanishes on the deep fill
                classes={{
                  field:
                    "flex flex-col gap-3 leading-relaxed md:text-xl [&_a]:text-primary-fg",
                }}
              />
            )}
            {/* a phone reads the figures, then
                Donate, full width; wider, Donate leads its row */}
            <div className="flex flex-col gap-4 pt-2 md:flex-row md:flex-wrap md:items-center md:gap-6">
              <DonateButton
                ref={set_hero_donate}
                to={props.donate_to}
                size="lg"
                classes="max-md:order-last"
              />
              <RaisedStats
                raised={npo.contributions_total}
                donors={props.donors}
                target={npo.target}
                variant="inline"
              />
            </div>
          </div>
        </div>
      </BrandBand>
      <div className="page flex flex-col gap-8 py-8 empty:hidden md:py-10">
        <WaysToHelp
          give={props.give}
          programs={props.programs}
          videos={props.videos}
          failed={props.failed}
          now={props.now}
        />
        <QuoteStrip
          messages={props.messages}
          tone="light"
          on_more={props.on_more_messages}
        />
      </div>
    </OrgPageFrame>
  );
}
