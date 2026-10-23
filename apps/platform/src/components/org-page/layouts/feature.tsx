import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { RichText, to_text } from "#/components/rich-text";
import { STORY_CLAMP } from "@/org-shape";
import { BrandBand } from "../brand-band";
import { DonateButton } from "../donate";
import type { IHeaderSection } from "../header";
import { ItemsByCount } from "../items-by-count";
import { OrgBanner } from "../org-banner";
import { OrgMark } from "../org-mark";
import { OrgMeta } from "../org-meta";
import { OrgName } from "../org-name";
import { QuoteStrip } from "../quote-strip";
import { RaisedStats } from "../raised-stats";
import { SwipeRow } from "../swipe-row";
import { VideoSet } from "../video-set";
import { OrgPageFrame } from "./org-page-frame";
import type { IOrgLayout } from "./types";
import { FAILED_LINE, give_label } from "./ways-to-help";

type TKind = keyof IOrgLayout["failed"];

const KINDS: TKind[] = ["give", "programs", "videos"];

/** each kind's heading, which its header link repeats; give's is named by
 * what the list holds */
const LABEL: Record<Exclude<TKind, "give">, string> = {
  programs: "Programs",
  videos: "Videos",
};

/** the in-page anchor each section takes */
const ANCHOR: Record<TKind | "story", string> = {
  story: "story",
  give: "campaigns",
  programs: "programs",
  videos: "videos",
};

const H2 = "text-xl font-bold lg:text-2xl";

/** clears the sticky header when an anchor lands on a section */
const ANCHORED = "scroll-mt-20";

/** a long story, 4+ items: the story beside a give panel that sticks while it
 * scrolls, then a section per kind. on a phone the panel sits in the hero */
export function Feature(props: IOrgLayout) {
  const { npo, shape, failed, now } = props;
  const [hero_donate, set_hero_donate] = useState<HTMLElement | null>(null);
  const lists = {
    give: props.give,
    programs: props.programs,
    videos: props.videos,
  };
  const has_story = !!to_text(npo.overview_pt).trim();
  // a failed kind keeps its section, so its line is seen
  const kinds = KINDS.filter((k) => failed[k] || lists[k].length > 0);
  const label = (k: TKind) =>
    k === "give" ? give_label(lists.give) : LABEL[k];
  const sections: IHeaderSection[] = [
    ...(has_story ? [{ id: ANCHOR.story, label: "Story" }] : []),
    ...kinds.map((k) => ({ id: ANCHOR[k], label: label(k) })),
  ];

  function content(k: TKind): ReactNode {
    if (failed[k]) {
      return <p className="text-sm text-gray-11">{FAILED_LINE[k]}</p>;
    }
    if (k === "videos") return <VideoSet videos={lists.videos} />;
    // programs are rows at any count
    return <ItemsByCount items={lists[k]} now={now} />;
  }

  return (
    <OrgPageFrame page={props} hero_donate={hero_donate} sections={sections}>
      <FeatureHero page={props} donate_ref={set_hero_donate} />
      <SectionStrip sections={sections} />
      <div className="page flex flex-col gap-10 py-8 md:gap-12 md:py-12">
        <div className="flex flex-col gap-8 md:grid md:grid-cols-[minmax(0,1fr)_20rem] md:items-start md:gap-12">
          {has_story && (
            <Story
              json={npo.overview_pt}
              clamp={shape.story_chars > STORY_CLAMP}
            />
          )}
          <aside
            aria-label={`Give to ${npo.name}`}
            className="card sticky top-20 flex flex-col gap-4 max-md:hidden md:col-start-2"
          >
            <RaisedStats
              raised={npo.contributions_total}
              donors={props.donors}
              target={npo.target}
              variant="panel"
            />
            <DonateButton to={props.donate_to} size="lg" />
          </aside>
        </div>
        {kinds.map((k) =>
          k === "give" && !failed.give && lists.give.length > 3 ? (
            <div key={k} id={ANCHOR.give} className={ANCHORED}>
              <SwipeRow heading={label(k)} items={lists.give} now={now} />
            </div>
          ) : (
            <Section key={k} id={ANCHOR[k]} heading={label(k)}>
              {content(k)}
            </Section>
          )
        )}
        <QuoteStrip
          messages={props.messages}
          tone="dark"
          on_more={props.on_more_messages}
        />
      </div>
    </OrgPageFrame>
  );
}

interface IFeatureHero {
  page: IOrgLayout;
  donate_ref: (el: HTMLElement | null) => void;
}

/** the banner over a tint band, the ringed mark overlapping it; no banner,
 * and the band is the brand's. the mark, the meta row, the name, the tagline
 * (or the story's first sentence), then Donate; a phone's Donate comes with
 * the raised figures, in a panel */
function FeatureHero({ page, donate_ref }: IFeatureHero) {
  const { npo } = page;
  const banner = !!npo.image;
  const lead = npo.tagline?.trim() || first_sentence(to_text(npo.overview_pt));
  return (
    <>
      <OrgBanner src={npo.image} />
      <BrandBand
        tone={banner ? "tint" : "primary"}
        classes={banner ? "pb-8 md:pb-10" : "py-8 md:py-10"}
      >
        <div className="page flex flex-col gap-4">
          <OrgMark
            name={npo.name}
            logo={npo.logo}
            size="lg"
            ring={banner}
            classes={banner ? "-mt-10 md:-mt-12" : ""}
          />
          <OrgMeta npo={npo} credential={page.credential} />
          <OrgName name={npo.name} scale="md" />
          {lead && (
            <p
              className={`line-clamp-3 max-w-3xl text-lg md:text-xl ${banner ? "text-gray-11" : ""}`}
            >
              {lead}
            </p>
          )}
          <DonateButton
            to={page.donate_to}
            size="lg"
            ref={donate_ref}
            classes="self-start max-md:hidden"
          />
          {/* the tint is blue-2, the panel's rung in another hue, so a card
              on it goes up a step; on the brand fill the band is the card */}
          <div
            className={`flex flex-col gap-4 md:hidden ${banner ? "card-on-band" : ""}`}
          >
            <RaisedStats
              raised={npo.contributions_total}
              donors={page.donors}
              target={npo.target}
              variant="panel"
            />
            <DonateButton to={page.donate_to} size="lg" />
          </div>
        </div>
      </BrandBand>
    </>
  );
}

/** the story's opening sentence, or its first line when that has no stop */
function first_sentence(text: string): string {
  const t = text.trim();
  return t.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? t.split("\n")[0];
}

interface ISectionStrip {
  sections: IHeaderSection[];
}

/** the header's section links, for the widths the header leaves them out */
function SectionStrip({ sections }: ISectionStrip) {
  if (sections.length === 0) return null;
  return (
    <nav aria-label="Sections" className="border-b lg:hidden">
      <ul className="page flex gap-1 overflow-x-auto">
        {sections.map((s) => (
          // the first label's text, not its target, on the page's edge
          <li key={s.id} className="shrink-0 first:-ml-2.5">
            <a
              href={`#${s.id}`}
              className="link flex min-h-11 items-center px-2.5 font-semibold"
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

interface IStory {
  /** portable text */
  json: string;
  /** past `STORY_CLAMP` characters: cut short behind "Read the full story" */
  clamp: boolean;
}

function Story({ json, clamp }: IStory) {
  const id = useId();
  const heading_id = `${id}-heading`;
  const body_id = `${id}-body`;
  const [open, set_open] = useState(false);
  // past the clamp by characters, yet a wide column can still fit it all: what
  // the box measures decides the fade and the button. the server assumes a cut
  const [cut, set_cut] = useState(true);
  const clamped = clamp && !open;
  const body = useRef<HTMLDivElement>(null);
  const fade = useRef<HTMLDivElement>(null);

  // overflow hides the rest from the eye alone: a link under the fade or past
  // it would still take focus, and scroll the box rather than open it
  // biome-ignore lint/correctness/useExhaustiveDependencies: json brings new links and cut mounts or drops the fade, and either moves the line links are cut at
  useEffect(() => {
    const box = body.current;
    if (!box) return;
    const links = Array.from(box.querySelectorAll("a"));
    if (!clamped) {
      box.style.maxHeight = "";
      for (const a of links) a.inert = false;
      return;
    }
    const sync = () => {
      // max-h-120 is the cap; the cut moves up to the last whole line under
      // it, so the fade never ends through a line's glyphs
      box.style.maxHeight = "";
      box.style.maxHeight = `${last_line_bottom(box, box.clientHeight)}px`;
      set_cut(box.scrollHeight > box.clientHeight);
      const limit = fade.current
        ? fade.current.getBoundingClientRect().top
        : box.getBoundingClientRect().bottom;
      for (const a of links) a.inert = a.getBoundingClientRect().bottom > limit;
    };
    sync();
    // the box's own size, and the text's as it reflows inside it
    const observer = new ResizeObserver(sync);
    observer.observe(box);
    if (box.firstElementChild) observer.observe(box.firstElementChild);
    return () => observer.disconnect();
  }, [clamped, cut, json]);

  return (
    <section
      id={ANCHOR.story}
      aria-labelledby={heading_id}
      className={`flex min-w-0 flex-col gap-4 ${ANCHORED}`}
    >
      <h2 id={heading_id} className={H2}>
        Our story
      </h2>
      {/* no gap over the button: while clamped, the fade is the gap */}
      <div className="flex flex-col">
        <div
          id={body_id}
          ref={body}
          className={clamped ? "relative max-h-120 overflow-hidden" : ""}
        >
          <RichText
            readOnly
            content={{ value: json }}
            classes={{
              field:
                "flex max-w-3xl flex-col gap-4 text-base leading-relaxed md:text-lg",
            }}
          />
          {clamped && cut && (
            <div
              ref={fade}
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-b from-transparent to-background"
            />
          )}
        </div>
        {clamp && (open || cut) && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={body_id}
            onClick={() => set_open((x) => !x)}
            className="link min-h-11 self-start font-bold"
          >
            {open ? "Show less" : "Read the full story"}
          </button>
        )}
      </div>
    </section>
  );
}

/** the bottom of the last whole line that ends within `cap` of `box`'s top,
 * measured from that top. lines are counted down each block that holds text,
 * in steps of its line height */
function last_line_bottom(box: HTMLElement, cap: number): number {
  const top = box.getBoundingClientRect().top;
  const texts = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
  const blocks = new Set<HTMLElement>();
  for (let node = texts.nextNode(); node; node = texts.nextNode()) {
    if (!node.textContent?.trim()) continue;
    let el = node.parentElement;
    while (
      el &&
      el !== box &&
      getComputedStyle(el).display.startsWith("inline")
    ) {
      el = el.parentElement;
    }
    if (el && el !== box) blocks.add(el);
  }
  let end = 0;
  for (const block of blocks) {
    const r = block.getBoundingClientRect();
    if (r.top - top >= cap) break;
    const line = Number.parseFloat(getComputedStyle(block).lineHeight);
    if (Number.isNaN(line) || line <= 0) continue;
    const fit = Math.min(
      Math.round(r.height / line),
      Math.floor((cap - (r.top - top) + 0.5) / line)
    );
    if (fit > 0) end = r.top - top + fit * line;
  }
  return end || cap;
}

interface ISection {
  id: string;
  heading: string;
  children: ReactNode;
}

function Section({ id, heading, children }: ISection) {
  const heading_id = useId();
  return (
    <section
      id={id}
      aria-labelledby={heading_id}
      className={`flex flex-col gap-3 ${ANCHORED}`}
    >
      <h2 id={heading_id} className={H2}>
        {heading}
      </h2>
      {children}
    </section>
  );
}
