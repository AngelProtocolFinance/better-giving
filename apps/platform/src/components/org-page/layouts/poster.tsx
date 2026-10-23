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
import { has_ways_to_help, WaysToHelp } from "./ways-to-help";

/** a short story or none, and 0-3 items: the hero on the deep band is the
 * whole pitch, under the banner when there is one and leading the page when
 * not: the name, the tagline as its deck, Donate, then the short story, which
 * would otherwise push Donate past a phone's first screen. whatever
 * there is to give to follows it in one row, then the donors' words */
export function Poster(props: IOrgLayout) {
  const { npo } = props;
  // the hero's Donate, which the header waits on before showing its own
  const [hero_donate, set_hero_donate] = useState<HTMLElement | null>(null);
  const has_story = !!to_text(npo.overview_pt).trim();
  const tagline = npo.tagline?.trim();
  const has_more = has_ways_to_help(props) || props.messages.length > 0;

  return (
    <OrgPageFrame page={props} hero_donate={hero_donate}>
      <OrgBanner src={npo.image} />
      {/* with nothing after it, the band fills main down to the footer and
          centres the hero in it, leaving no bare page between them */}
      <BrandBand
        tone="deep"
        classes={`py-8 md:py-12 ${has_more ? "" : "flex flex-1 flex-col justify-center"}`}
      >
        <div className="page">
          {/* the name and its deck take a wider measure than the story's, so
              a long name and a full tagline wrap a line less above Donate */}
          <div className="flex max-w-3xl flex-col gap-4 md:gap-5 lg:max-w-5xl">
            <div className="flex items-center gap-3 md:gap-4">
              <OrgMark name={npo.name} logo={npo.logo} size="md" ring />
              <OrgMeta npo={npo} credential={props.credential} />
            </div>
            <OrgName name={npo.name} scale="lg" />
            {tagline && (
              <p className="text-lg leading-snug md:text-2xl">{tagline}</p>
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
            {has_story && (
              <RichText
                readOnly
                content={{ value: npo.overview_pt }}
                // a story link keeps the band's ink: the editor's primary
                // link ink vanishes on the deep fill
                classes={{
                  field:
                    "flex max-w-3xl flex-col gap-3 leading-relaxed md:text-xl [&_a]:text-primary-fg",
                }}
              />
            )}
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
