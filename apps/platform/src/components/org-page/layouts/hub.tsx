import { TabPanel, Tabs } from "@better-giving/ui";
import { type ReactNode, useId, useState } from "react";
import { RichText, to_text } from "#/components/rich-text";
import { BrandBand } from "../brand-band";
import { DonateButton } from "../donate";
import type { TOrgItem } from "../items";
import { ItemsByCount, ShowMoreGrid } from "../items-by-count";
import { OrgBanner } from "../org-banner";
import { OrgMark } from "../org-mark";
import { OrgMeta } from "../org-meta";
import { OrgName } from "../org-name";
import { QuoteStrip } from "../quote-strip";
import { RaisedStats } from "../raised-stats";
import { VideoSet } from "../video-set";
import { OrgPageFrame } from "./org-page-frame";
import type { IOrgLayout } from "./types";
import { FAILED_LINE, give_label } from "./ways-to-help";

type TKind = keyof IOrgLayout["failed"];
type TTab = TKind | "messages";

const KINDS: TKind[] = ["give", "programs", "videos"];

const LABEL: Record<Exclude<TTab, "give">, string> = {
  programs: "Programs",
  videos: "Videos",
  messages: "Messages",
};

const H2 = "text-xl font-bold lg:text-2xl";

/** short or no story, 4+ items: a compact identity hero, then a tab per kind
 * of item. a kind with one item sits above the tabs as Featured, the kind
 * with the most items is the first tab, and a lone kind gets no tabs at all */
export function Hub(props: IOrgLayout) {
  const { failed, now, messages } = props;
  const [hero_donate, set_hero_donate] = useState<HTMLElement | null>(null);
  const lists = {
    give: props.give,
    programs: props.programs,
    videos: props.videos,
  };

  const featured = KINDS.filter(
    (k) => !failed[k] && lists[k].length === 1
  ).flatMap((k): TOrgItem[] => lists[k]);
  const featured_cards = featured.filter((x) => x.kind !== "video");
  const featured_video = featured.filter((x) => x.kind === "video");
  // a failed kind keeps its tab so its line is seen; sort is stable, so ties
  // keep campaigns, programs, videos
  const tabs: TTab[] = KINDS.filter(
    (k) => failed[k] || lists[k].length > 1
  ).sort((a, b) => lists[b].length - lists[a].length);
  if (messages.length > 0) tabs.push("messages");

  const label = (t: TTab) => (t === "give" ? give_label(lists.give) : LABEL[t]);

  /** a tab's label with its item count. messages arrive a page at a time, so
   * they have no count to give */
  function tab_label(t: TTab): string {
    if (t === "messages" || failed[t]) return label(t);
    return `${label(t)} ${lists[t].length}`;
  }

  function content(t: TTab): ReactNode {
    if (t === "messages") {
      return (
        <QuoteStrip
          messages={messages}
          tone="light"
          on_more={props.on_more_messages}
        />
      );
    }
    if (failed[t]) {
      return <p className="text-sm text-gray-11">{FAILED_LINE[t]}</p>;
    }
    if (t === "videos") return <VideoSet videos={lists.videos} />;
    return <ShowMoreGrid items={lists[t]} now={now} />;
  }

  return (
    <OrgPageFrame page={props} hero_donate={hero_donate}>
      <HubHero page={props} donate_ref={set_hero_donate} />
      <div className="page flex flex-col gap-8 py-8 md:gap-10 md:py-10">
        {featured.length > 0 && (
          <Section heading="Featured">
            <div className="flex flex-col gap-4">
              <ItemsByCount items={featured_cards} now={now} />
              {/* a lone video at the content's full width outweighs the
                  tabs under it, so it takes the reading measure, centred */}
              <VideoSet
                videos={featured_video}
                classes="mx-auto w-full max-w-3xl"
              />
            </div>
          </Section>
        )}
        {tabs.length === 1 && (
          <Section heading={label(tabs[0])}>{content(tabs[0])}</Section>
        )}
        {tabs.length > 1 && (
          <Tabs
            items={tabs.map((t) => ({ value: t, label: tab_label(t) }))}
            defaultValue={tabs[0]}
          >
            {tabs.map((t) => (
              <TabPanel key={t} value={t} className="pt-6">
                <h2 className="sr-only">{label(t)}</h2>
                {content(t)}
              </TabPanel>
            ))}
          </Tabs>
        )}
      </div>
    </OrgPageFrame>
  );
}

interface IHubHero {
  page: IOrgLayout;
  donate_ref: (el: HTMLElement | null) => void;
}

/** the banner over a tint band, the ringed mark overlapping it; no banner,
 * and the band is the brand's. on a phone everything stacks, ending on Donate */
function HubHero({ page, donate_ref }: IHubHero) {
  const { npo } = page;
  const banner = !!npo.image;
  const tagline = npo.tagline?.trim();
  const has_story = !!to_text(npo.overview_pt).trim();
  return (
    <>
      <OrgBanner src={npo.image} />
      <BrandBand
        tone={banner ? "tint" : "primary"}
        classes={`border-b pb-6 md:pb-8 ${banner ? "pt-4" : "pt-6 md:pt-8"}`}
      >
        <div className="page grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-end md:gap-6">
          <OrgMark
            name={npo.name}
            logo={npo.logo}
            size="lg"
            ring={banner}
            // the overlap plus the band's pt-4, which is what keeps the name
            // clear of the banner
            classes={banner ? "-mt-14 md:-mt-16 md:self-start" : ""}
          />
          <div className="flex min-w-0 flex-col gap-2">
            <OrgName name={npo.name} scale="sm" />
            {/* the tagline in the band's ink, then the short story, muted on
                the tint */}
            {tagline && <p className="max-w-2xl">{tagline}</p>}
            {has_story && (
              <RichText
                readOnly
                content={{ value: npo.overview_pt }}
                classes={{
                  field: `flex max-w-2xl flex-col gap-2 ${banner ? "text-gray-11" : ""}`,
                }}
              />
            )}
            <OrgMeta npo={npo} credential={page.credential} />
          </div>
          <div className="flex flex-col gap-3 pt-1 md:items-end md:pt-0">
            <RaisedStats
              raised={npo.contributions_total}
              donors={page.donors}
              target={npo.target}
              variant="inline"
              classes="md:text-right"
            />
            <DonateButton to={page.donate_to} size="lg" ref={donate_ref} />
          </div>
        </div>
      </BrandBand>
    </>
  );
}

interface ISection {
  heading: string;
  children: ReactNode;
}

function Section({ heading, children }: ISection) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 md:gap-4">
      <h2 id={id} className={H2}>
        {heading}
      </h2>
      {children}
    </section>
  );
}
