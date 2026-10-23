import { ExtLink, Image } from "@better-giving/ui";
import { to_usd } from "@better-giving/ui/helpers";
import { ChevronRight, Globe, MapPin } from "lucide-react";
import { type ReactNode, Suspense, useRef, useState } from "react";
import { Await, href, Link } from "react-router";
import fallback_banner from "#/assets/images/bg-banner.webp";
import flying_character from "#/assets/images/flying-character.webp";
import { DonorLoadError, PendingButton } from "#/components/donor-msgs";
import { type IOrgDetails, OrgFooter } from "#/components/org-page/footer";
import { GoalBar } from "#/components/org-page/goal-bar";
import { OrgHeader } from "#/components/org-page/header";
import { RichText, to_excerpt, to_text } from "#/components/rich-text";
import { extract_youtube_id } from "#/components/youtube-player";
import { org_href, program_href } from "#/helpers/org-href";
import { Share } from "#/routes/_app.fundraisers.$fund_id/share";
import { Video } from "#/routes/_app.fundraisers.$fund_id/video";
import {
  donor_noun,
  goal_amount,
  percent_label,
} from "#/routes/org.$org.$campaign/format";
import type { IFundItem } from "@/fundraiser";
import { fund_item_is_open } from "@/fundraiser/is-open";
import type { IMedia, IProgramDb } from "@/npo";
import type { INpoPublic } from "$/pg/queries/npo";

interface ICampaignCard {
  id: string;
  name: string;
  to: string;
  image: string | null;
  raised: number;
  target?: string;
  /** run by the org itself, rather than by a supporter on its behalf */
  official: boolean;
  /** the owner's mark */
  mark: string | null;
  excerpt: string;
  /** null when the count is unavailable */
  supporters: number | null;
  donate_to: string;
  /** who runs it, when that is not the org */
  byline?: string;
}

interface IMessage {
  id: string;
  name: string;
  message: string;
}

export interface IProfile {
  npo: INpoPublic;
  url: string;
  donors: number | null;
  messages: IMessage[];
  /** cursor for the page after `messages`; null when there is none */
  messages_next: string | null;
  campaigns: ICampaignCard[];
  funds: Promise<IFundItem[]>;
  media: Promise<IMedia[]>;
  programs: Promise<IProgramDb[]>;
}

const h2 = "text-xl font-bold lg:text-2xl";

export function Profile(props: IProfile) {
  const { npo } = props;
  const donate_to = href("/donate/:id", { id: String(npo.id) });
  const details = org_details(npo);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-gray-12">
      <OrgHeader
        name={npo.name}
        logo={npo.logo}
        to={org_href(npo)}
        bookmark={{
          id: npo.id,
          name: npo.name,
          logo: npo.logo ?? undefined,
        }}
        share={{ recipientName: npo.name, url: props.url }}
        donate_to={donate_to}
      />
      <main className="page flex flex-1 flex-col gap-6 pt-4 pb-6 lg:gap-8 lg:pt-8 lg:pb-20">
        <Mast npo={npo} donors={props.donors} donate_to={donate_to} />
        {/* the dom is the phone's reading order. from xl the story takes three
            parts to the right column's one, which never drops under a campaign
            card's floor. the right column spans both rows, so the auto first
            row is the hero's height and messages start right under it,
            whatever the right column runs to */}
        <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,3fr)_minmax(18rem,1fr)] xl:grid-rows-[auto_1fr] xl:items-start xl:gap-8">
          <Hero npo={npo} classes="xl:col-start-1 xl:row-start-1" />
          <div className="flex min-w-0 flex-col gap-6 empty:hidden xl:col-start-2 xl:row-start-1 xl:row-end-3 xl:gap-8">
            <Campaigns
              npo_id={npo.id}
              origin={new URL(props.url).origin}
              campaigns={props.campaigns}
              funds={props.funds}
            />
            <Programs npo={npo} programs={props.programs} />
            <Media media={props.media} name={npo.name} />
          </div>
          <Messages
            key={npo.id}
            npo_id={npo.id}
            messages={props.messages}
            next={props.messages_next}
            classes="xl:col-start-1 xl:row-start-2"
          />
        </div>
      </main>
      <OrgFooter
        name={npo.name}
        logo={npo.logo}
        social_media_urls={npo.social_media_urls}
        details={details}
      />
    </div>
  );
}

interface INpoProps {
  npo: INpoPublic;
}

function org_details(npo: INpoPublic): IOrgDetails {
  return {
    registration_number: npo.registration_number,
    address: npo.street_address,
    active_in:
      npo.active_in_countries.length > 0
        ? npo.active_in_countries.join(", ")
        : npo.hq_country,
  };
}

interface IMast extends INpoProps {
  donors: number | null;
  donate_to: string;
}

/** the org's card. a phone sets the name beside the logo and everything else
 * full width under them, ending on Donate; wider screens put the text in a
 * column beside the logo and the raised block at the right, and leave Donate
 * to the header */
function Mast({ npo, donors, donate_to }: IMast) {
  const tag = npo.endow_designation !== "Other" ? npo.endow_designation : null;
  const has_meta = !!(tag || npo.hq_country || npo.url);
  return (
    <section className="card grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 lg:items-start lg:grid-cols-[auto_minmax(0,1fr)_18.75rem] lg:gap-x-7">
      <Image
        src={npo.logo || flying_character}
        alt=""
        width={128}
        height={128}
        className="size-18 shrink-0 rounded-full border bg-surface object-cover lg:size-32"
      />
      <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-3">
        <h1 className="text-2xl font-bold break-words lg:text-4xl">
          {npo.name}
        </h1>
        {npo.tagline && (
          <p className="col-span-2 text-gray-11 lg:max-w-3xl lg:text-lg">
            {npo.tagline}
          </p>
        )}
        {has_meta && (
          <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold">
            {tag && (
              <p className="rounded bg-secondary px-2 py-1 text-xs font-bold uppercase tracking-badge text-gray-12">
                {tag}
              </p>
            )}
            {npo.hq_country && (
              <span className="flex items-center gap-1">
                <MapPin aria-hidden className="icon-md text-gray-11" />
                {npo.hq_country}
              </span>
            )}
            {npo.url && (
              <ExtLink
                href={npo.url}
                className="link flex items-center gap-1 underline underline-offset-4"
              >
                <Globe aria-hidden className="icon-md" />
                {npo.url.replace(/^https?:\/\//i, "")}
              </ExtLink>
            )}
          </div>
        )}
      </div>
      <Raised
        npo={npo}
        donors={donors}
        classes="col-span-2 max-lg:pt-1 lg:col-span-1"
      />
      <Link
        to={donate_to}
        className="btn btn-primary btn-lg col-span-2 mt-1 lg:hidden"
      >
        Donate
      </Link>
    </section>
  );
}

interface IRaised extends INpoProps {
  donors: number | null;
  classes?: string;
}

/** the figures, each over its label. from lg the amount is the h1's size, so
 * its first line sits level with the name's, and the block hangs off the
 * card's right edge */
function Raised({ npo, donors, classes = "" }: IRaised) {
  const raised = npo.contributions_total ?? 0;
  const goal = goal_amount(npo.target, raised);
  return (
    <div className={`flex flex-col gap-2 ${classes}`}>
      <dl className="flex flex-wrap gap-x-4 gap-y-2 lg:justify-end">
        <Stat label="raised" value={to_usd(raised)} />
        {donors != null && (
          <Stat
            label={donor_noun(donors)}
            value={donors.toLocaleString("en-US")}
            classes="border-l pl-4"
          />
        )}
      </dl>
      {goal != null && (
        <>
          <GoalBar raised={raised} goal={goal} />
          <p className="text-xs text-gray-11 lg:text-right">
            {percent_label(raised, goal)} of {to_usd(goal)} goal
          </p>
        </>
      )}
    </div>
  );
}

interface IStat {
  label: string;
  value: string;
  classes?: string;
}

/** term before definition for a screen reader, figure over label on screen */
function Stat({ label, value, classes = "" }: IStat) {
  return (
    <div className={`flex flex-col-reverse ${classes}`}>
      <dt className="text-sm text-gray-11">{label}</dt>
      <dd className="text-2xl font-bold lg:text-4xl">{value}</dd>
    </div>
  );
}

interface IHero extends INpoProps {
  classes?: string;
}

/** the banner on top, then the org's story. the org's details are the
 * footer's */
function Hero({ npo, classes = "" }: IHero) {
  const has_about = !!to_text(npo.overview_pt).trim();
  return (
    <section
      className={`flex flex-col overflow-hidden rounded border bg-panel ${classes}`}
    >
      <Image
        src={npo.image || fallback_banner}
        alt=""
        className="aspect-4/1 w-full object-cover"
      />
      {has_about && (
        // the reading measure, which the card outruns from lg
        <div className="flex flex-col gap-3 p-6 lg:max-w-3xl">
          <h2 className={h2}>About</h2>
          <RichText
            readOnly
            content={{ value: npo.overview_pt }}
            classes={{
              field: "flex w-full flex-col gap-3 text-base leading-relaxed",
            }}
          />
        </div>
      )}
    </section>
  );
}

interface ICampaignsProps {
  npo_id: number;
  /** the page's origin, which campaign share links are built on */
  origin: string;
  campaigns: ICampaignCard[];
  funds: Promise<IFundItem[]>;
}

/** live campaigns, then the org's open fundraisers. the fundraisers stream in;
 * the section waits on them only when there is nothing else to show */
function Campaigns({ npo_id, origin, campaigns, funds }: ICampaignsProps) {
  const section = (cards: ICampaignCard[], note?: ReactNode) =>
    cards.length === 0 && !note ? null : (
      // sized off the section, not the viewport: from xl it is the narrow
      // right column, where the cards stack one per row
      <section className="@container flex flex-col gap-3">
        <h2 className={h2}>Campaigns</h2>
        {cards.length > 0 && (
          <ul className="grid gap-4 @xl:grid-cols-2">
            {cards.map((c) => (
              // a lone card takes the whole row, where its container query
              // sets the photo beside the details instead of over them
              <li key={c.id} className="@container @xl:only:col-span-2">
                <CampaignCard {...c} share_url={new URL(c.to, origin).href} />
              </li>
            ))}
          </ul>
        )}
        {note}
      </section>
    );

  return (
    <Suspense fallback={section(campaigns)}>
      <Await
        resolve={funds}
        errorElement={section(
          campaigns,
          <p className="text-sm text-gray-11">
            We couldn't load this nonprofit's campaigns right now. Please try
            again later.
          </p>
        )}
      >
        {(f) => section([...campaigns, ...live_funds(f, npo_id)])}
      </Await>
    </Suspense>
  );
}

/** the open fundraisers among `funds`, as cards. one the org owns is its own
 * campaign; anyone else's carries its creator's name */
function live_funds(funds: IFundItem[], npo_id: number): ICampaignCard[] {
  const now = new Date();
  return funds
    .filter((f) => fund_item_is_open(f, now))
    .map((f) => {
      const official = f.npo_owner === npo_id;
      return {
        id: f.id,
        name: f.name,
        to: href("/fundraisers/:fund_id", { fund_id: f.id }),
        image: f.banner || f.logo || null,
        raised: f.donation_total_usd,
        target: f.target,
        official,
        byline: official ? undefined : f.creator_name,
        mark: f.logo ?? null,
        excerpt: to_excerpt(f.description_pt),
        supporters: null,
        donate_to: href("/fundraisers/:fund_id/donate", { fund_id: f.id }),
      };
    });
}

function supporter_label(n: number): string {
  if (n === 1) return "1 supporter";
  return `${n.toLocaleString("en-US")} supporters`;
}

interface ICampaignCardProps extends ICampaignCard {
  /** absolute, for the networks the card shares to */
  share_url: string;
}

/** the name is the link, stretched over the card, so the card opens the
 * campaign while the link's name stays the campaign's. Share and Donate are
 * positioned, and later in the dom than the stretch, so they paint over it
 * and take their own clicks */
function CampaignCard(c: ICampaignCardProps) {
  const goal = goal_amount(c.target, c.raised);
  return (
    <article className="relative flex h-full flex-col overflow-hidden @2xl:grid @2xl:grid-cols-2 @2xl:grid-rows-[auto_1fr] rounded border bg-panel has-[h3_a:focus-visible]:outline-2 has-[h3_a:focus-visible]:outline-ring has-[h3_a:focus-visible]:-outline-offset-2">
      <p className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-11 @2xl:col-start-2 @2xl:row-start-1 @2xl:px-6 @2xl:pt-6">
        {c.mark ? (
          <Image
            src={c.mark}
            alt=""
            width={24}
            height={24}
            className="size-6 shrink-0 rounded-full border object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="size-6 shrink-0 rounded-full border bg-gray-3"
          />
        )}
        <span className="min-w-0 truncate">
          {c.official ? "Official campaign" : `By ${c.byline}`}
        </span>
      </p>
      {/* stacked in one grid cell, not positioned, so the card stays the box
          the link's ::after covers; grid-rows-1 holds the row to the 4:1
          box rather than the photo's own height */}
      <div className="grid aspect-4/1 grid-rows-1 overflow-hidden bg-gray-3 @2xl:col-start-1 @2xl:row-span-2 @2xl:row-start-1">
        {c.image && (
          <Image
            src={c.image}
            alt=""
            className="col-start-1 row-start-1 size-full object-cover"
          />
        )}
        {/* primary-deep/70 is the measured scrim for white copy over a photo */}
        <div className="col-start-1 row-start-1 flex flex-col items-center justify-center gap-2 bg-primary-deep/70 p-4 text-center text-white lg:p-6">
          <h3 className="text-xl font-bold">
            <Link
              to={c.to}
              className="outline-0 after:absolute after:inset-0 after:content-['']"
            >
              {c.name}
            </Link>
          </h3>
          {c.excerpt && <p className="line-clamp-2 text-sm">{c.excerpt}</p>}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4 @2xl:col-start-2 @2xl:px-6 @2xl:pb-6">
        {goal != null ? (
          <>
            <GoalBar raised={c.raised} goal={goal} />
            <div className="flex justify-between gap-2">
              <p className="flex flex-col gap-1">
                <strong className="text-lg">{to_usd(c.raised)}</strong>
                <span className="text-xs text-gray-11">Raised</span>
              </p>
              <p className="flex flex-col items-end gap-1">
                <strong className="text-lg">{to_usd(goal)}</strong>
                <span className="text-xs text-gray-11">Goal</span>
              </p>
            </div>
          </>
        ) : (
          <p className="flex flex-col gap-1">
            <strong className="text-lg">{to_usd(c.raised)}</strong>
            <span className="text-xs text-gray-11">Raised · no goal set</span>
          </p>
        )}
        <div className="mt-auto flex items-center gap-2 pt-1">
          {/* -ml-3 sets the glyph, not its 44px target, on the card's edge */}
          <Share
            trigger="icon"
            label={`Share ${c.name}`}
            recipientName={c.name}
            url={c.share_url}
            classes="relative -ml-3"
          />
          <div className="ml-auto flex items-center gap-2">
            {c.supporters != null && (
              <span className="text-sm font-semibold text-gray-11">
                {supporter_label(c.supporters)}
              </span>
            )}
            <Link to={c.donate_to} className="btn btn-primary relative">
              Donate
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

interface IProgramsProps extends INpoProps {
  programs: Promise<IProgramDb[]>;
}

function Programs({ npo, programs }: IProgramsProps) {
  return (
    <Suspense fallback={null}>
      <Await
        resolve={programs}
        errorElement={
          <p className="text-sm text-gray-11">
            We couldn't load this nonprofit's programs right now. Please try
            again later.
          </p>
        }
      >
        {(p) =>
          p.length === 0 ? null : (
            <section className="@container flex flex-col gap-3">
              <h2 className={h2}>Programs</h2>
              <ul className="divide-y overflow-hidden rounded border bg-panel">
                {p.map((prog) => (
                  <li key={prog.id}>
                    <Link
                      to={program_href(npo, prog.id)}
                      className="flex min-h-11 gap-4 pr-4 text-gray-12"
                    >
                      {/* bleeds to the row's left, top and bottom, the list's
                          frame rounding it; the photo is positioned so its own
                          ratio never sets the row's height */}
                      <span className="relative w-16 shrink-0 bg-gray-3 @xl:w-24">
                        {prog.banner && (
                          <Image
                            src={prog.banner}
                            alt=""
                            className="absolute inset-0 size-full object-cover"
                          />
                        )}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col justify-center gap-1 py-4">
                        <span className="font-bold">{prog.title}</span>
                        <span className="truncate text-sm text-gray-11 @max-xl:hidden">
                          {to_text(prog.description_pt)}
                        </span>
                      </span>
                      <ChevronRight
                        aria-hidden
                        className="icon-md shrink-0 self-center text-gray-11"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )
        }
      </Await>
    </Suspense>
  );
}

/** the first featured video plays large, the rest sit under it; a link that
 * is not youtube (from before entry was youtube-only) stays a plain link */
interface IMediaProps {
  media: Promise<IMedia[]>;
  /** the org's name, which tells its video frames apart for assistive tech */
  name: string;
}

function Media({ media, name }: IMediaProps) {
  return (
    <Suspense fallback={null}>
      <Await
        resolve={media}
        errorElement={
          <p className="text-sm text-gray-11">
            We couldn't load this nonprofit's videos right now. Please try again
            later.
          </p>
        }
      >
        {(m) => {
          if (m.length === 0) return null;
          let frames = 0;
          const [first, ...rest] = m.map((item) => ({
            item,
            title: extract_youtube_id(item.url)
              ? `${name} video ${++frames}`
              : null,
          }));
          return (
            <section className="@container flex flex-col gap-3">
              <h2 className={h2}>Media</h2>
              <Medium {...first} />
              {rest.length > 0 && (
                <div className="grid gap-4 @xl:grid-cols-3">
                  {rest.map((v) => (
                    <Medium key={v.item.id} {...v} />
                  ))}
                </div>
              )}
            </section>
          );
        }}
      </Await>
    </Suspense>
  );
}

interface IMedium {
  item: IMedia;
  /** null for a link that is not youtube, which renders as a plain link */
  title: string | null;
}

function Medium({ item, title }: IMedium) {
  if (title == null) {
    return (
      <ExtLink href={item.url} className="link break-all">
        {item.url}
      </ExtLink>
    );
  }
  return <Video url={item.url} title={title} />;
}

interface IMessages {
  npo_id: number;
  messages: IMessage[];
  next: string | null;
  classes?: string;
}

interface IDonorsPage {
  items: {
    id: string;
    donor_name?: string | null;
    donor_message?: string | null;
  }[];
  next?: string;
}

/** a page of `/api/npo/:id/donors` as messages: blank ones dropped, the amount
 * never read — the same rule the loader applies to the first page */
async function messages_page(npo_id: number, cursor: string) {
  const q = new URLSearchParams({ next: cursor });
  const res = await fetch(`/api/npo/${npo_id}/donors?${q}`);
  if (!res.ok) throw new Error(String(res.status));
  const page: IDonorsPage = await res.json();
  const messages: IMessage[] = page.items
    .filter((m) => m.donor_message?.trim())
    .map((m) => ({
      id: m.id,
      name: m.donor_name || "Donor",
      message: m.donor_message as string,
    }));
  return { messages, next: page.next ?? null };
}

function Messages({ npo_id, messages, next, classes = "" }: IMessages) {
  const [more, set_more] = useState<IMessage[]>([]);
  const [cursor, set_cursor] = useState(next);
  const [pending, set_pending] = useState<null | "more" | "retry">(null);
  const [failed, set_failed] = useState(false);
  const inflight = useRef(false);
  const shown = [...messages, ...more];
  if (shown.length === 0 && !cursor) return null;

  /** one press shows at least one more message, or reaches the last page */
  async function load(from: "more" | "retry") {
    if (inflight.current || !cursor) return;
    inflight.current = true;
    set_pending(from);
    try {
      let at: string | null = cursor;
      let got = 0;
      while (at && got === 0) {
        const page = await messages_page(npo_id, at);
        got = page.messages.length;
        set_more((prev) => [...prev, ...page.messages]);
        at = page.next;
        set_cursor(at);
      }
      set_failed(false);
    } catch {
      set_failed(true);
    } finally {
      inflight.current = false;
      set_pending(null);
    }
  }

  const error_id = `messages-error-${npo_id}`;
  return (
    <section className={`flex flex-col gap-3 ${classes}`}>
      <h2 className={h2}>Donor messages</h2>
      {shown.map((m) => (
        <figure key={m.id} className="card flex flex-col gap-2">
          <figcaption className="text-sm font-bold">{m.name}</figcaption>
          <blockquote className="break-words leading-relaxed">
            {m.message}
          </blockquote>
        </figure>
      ))}
      {cursor && (
        <PendingButton
          resting="View more"
          pending="Loading messages"
          busy={pending === "more"}
          described_by={failed ? error_id : undefined}
          onClick={() => load("more")}
          className="min-h-11 self-start text-left text-base font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      )}
      {failed && (
        <DonorLoadError
          message="Couldn't load more messages."
          pending="Loading messages"
          busy={pending === "retry"}
          message_id={error_id}
          on_retry={() => load("retry")}
        />
      )}
    </section>
  );
}
