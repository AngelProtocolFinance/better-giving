import { ExtLink, Image } from "@better-giving/ui";
import { to_usd } from "@better-giving/ui/helpers";
import { ChevronRight, Globe, MapPin } from "lucide-react";
import { type ReactNode, Suspense } from "react";
import { Await, href, Link } from "react-router";
import fallback_banner from "#/assets/images/bg-banner.webp";
import flying_character from "#/assets/images/flying-character.webp";
import { OrgFooter } from "#/components/org-page/footer";
import { GoalBar } from "#/components/org-page/goal-bar";
import { OrgHeader } from "#/components/org-page/header";
import { RichText, to_text } from "#/components/rich-text";
import { extract_youtube_id } from "#/components/youtube-player";
import { unsdgs } from "#/constants/unsdgs";
import { org_href, program_href } from "#/helpers/org-href";
import { Share } from "#/routes/_app.fundraisers.$fund_id/share";
import { Video } from "#/routes/_app.fundraisers.$fund_id/video";
import { donor_label, goal_amount } from "#/routes/org.$org.$campaign/format";
import type { IFundItem } from "@/fundraiser";
import type { IMedia, IProgramDb, UnSdgNum } from "@/npo";
import type { INpoPublic } from "$/pg/queries/npo";

interface ICampaignCard {
  id: string;
  name: string;
  to: string;
  image: string | null;
  raised: number;
  target?: string;
}

interface IMessage {
  id: string;
  name: string;
  message: string;
}

export interface IProfile {
  npo: INpoPublic;
  url: string;
  donors: number;
  messages: IMessage[];
  campaigns: ICampaignCard[];
  funds: Promise<IFundItem[]>;
  media: Promise<IMedia[]>;
  programs: Promise<IProgramDb[]>;
}

const h2 = "text-2xl font-bold";

export function Profile(props: IProfile) {
  const { npo } = props;
  const donate_to = href("/donate/:id", { id: String(npo.id) });
  const share = { recipientName: npo.name, url: props.url };

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
      />
      <div
        className="h-32 w-full bg-cover bg-center sm:h-72"
        style={{ backgroundImage: `url('${npo.image || fallback_banner}')` }}
      />
      <main className="page flex-1 pb-28 lg:pb-20">
        <Mast npo={npo} />
        <div className="mt-8 flex flex-col gap-8 lg:mt-10 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-10">
          <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-12">
            <About npo={npo} />
            <Campaigns campaigns={props.campaigns} funds={props.funds} />
            <Programs npo={npo} programs={props.programs} />
            <Media media={props.media} />
          </div>
          <aside className="contents lg:flex lg:flex-col lg:gap-5">
            <section
              aria-label="Fundraising progress"
              className="order-1 flex flex-col gap-2 lg:order-none"
            >
              <Raised npo={npo} donors={props.donors} />
              <Link to={donate_to} className="btn btn-primary max-lg:hidden">
                Donate
              </Link>
              <Share trigger="button" classes="max-lg:hidden" {...share} />
            </section>
            <Messages messages={props.messages} />
            <Details npo={npo} />
          </aside>
        </div>
      </main>
      <OrgFooter
        name={npo.name}
        logo={npo.logo}
        social_media_urls={npo.social_media_urls}
      />
      {/* on a phone the action column folds into the page, so donate pins */}
      <div className="fixed inset-x-0 bottom-0 z-sticky flex gap-2 border-t bg-panel px-4 py-3 lg:hidden">
        <Share trigger="button" classes="min-w-0 flex-1" {...share} />
        <Link to={donate_to} className="btn btn-primary min-w-0 flex-1">
          Donate
        </Link>
      </div>
    </div>
  );
}

interface INpoProps {
  npo: INpoPublic;
}

function Mast({ npo }: INpoProps) {
  const tag = npo.endow_designation !== "Other" ? npo.endow_designation : null;
  return (
    // only the logo rides up over the banner; the text stays on the page ground
    <section className="flex flex-wrap items-start gap-4 sm:gap-6">
      <Image
        src={npo.logo || flying_character}
        alt=""
        width={144}
        height={144}
        className="-mt-10 size-22 shrink-0 rounded border-4 border-panel bg-panel object-cover sm:-mt-16 sm:size-36"
      />
      <div className="flex min-w-0 flex-[999_1_26rem] flex-col gap-2 sm:pt-4">
        {tag && (
          <p className="w-fit rounded-full bg-secondary px-3 py-1 text-xs font-bold uppercase tracking-badge text-primary-deep">
            {tag}
          </p>
        )}
        <h1 className="text-3xl font-bold break-words sm:text-4xl">
          {npo.name}
        </h1>
        {npo.tagline && (
          <p className="max-w-3xl text-lg text-gray-11">{npo.tagline}</p>
        )}
        <div className="flex flex-wrap gap-x-5 gap-y-2 font-semibold">
          {npo.hq_country && (
            <span className="flex items-center gap-2">
              <MapPin aria-hidden className="icon-md text-primary" />
              {npo.hq_country}
            </span>
          )}
          {npo.url && (
            <span className="flex items-center gap-2">
              <Globe aria-hidden className="icon-md text-primary" />
              <ExtLink href={npo.url} className="link underline">
                {npo.url.replace(/^https?:\/\//i, "")}
              </ExtLink>
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

interface IRaised extends INpoProps {
  donors: number;
}

function Raised({ npo, donors }: IRaised) {
  const raised = npo.contributions_total ?? 0;
  const goal = goal_amount(npo.target, raised);
  return (
    <div className="card flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-3xl font-bold">{to_usd(raised)}</p>
        <p className="text-gray-11">raised from {donor_label(donors)}</p>
      </div>
      {goal != null && (
        <div className="flex flex-col gap-1.5">
          <GoalBar raised={raised} goal={goal} />
          <p className="text-sm text-gray-11">
            {Math.floor((raised / goal) * 100)}% of {to_usd(goal)} goal
          </p>
        </div>
      )}
    </div>
  );
}

function About({ npo }: INpoProps) {
  if (!to_text(npo.overview_pt).trim()) return null;
  return (
    <section className="order-2 flex flex-col gap-4 lg:order-none">
      <h2 className={h2}>About</h2>
      <RichText
        readOnly
        content={{ value: npo.overview_pt }}
        classes={{ field: "w-full text-base leading-relaxed" }}
      />
    </section>
  );
}

interface ICampaignsProps {
  campaigns: ICampaignCard[];
  funds: Promise<IFundItem[]>;
}

/** live campaigns, then the org's open fundraisers. the fundraisers stream in;
 * the section waits on them only when there is nothing else to show */
function Campaigns({ campaigns, funds }: ICampaignsProps) {
  const section = (cards: ICampaignCard[], note?: ReactNode) =>
    cards.length === 0 && !note ? null : (
      <section className="order-3 flex flex-col gap-4 lg:order-none">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className={h2}>Campaigns</h2>
          {cards.length > 0 && (
            <span className="text-sm text-gray-11">{cards.length} live</span>
          )}
        </div>
        {cards.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2">
            {cards.map((c) => (
              <li key={c.id}>
                <CampaignCard {...c} />
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
        {(f) => section([...campaigns, ...live_funds(f)])}
      </Await>
    </Suspense>
  );
}

function live_funds(funds: IFundItem[]): ICampaignCard[] {
  const now = Date.now() / 1000;
  return funds
    .filter((f) => f.active && f.expiration > now)
    .map((f) => ({
      id: f.id,
      name: f.name,
      to: href("/fundraisers/:fund_id", { fund_id: f.id }),
      image: f.banner || f.logo || null,
      raised: f.donation_total_usd,
      target: f.target,
    }));
}

function CampaignCard(c: ICampaignCard) {
  const goal = goal_amount(c.target, c.raised);
  return (
    <Link
      to={c.to}
      className="flex h-full flex-col overflow-hidden rounded border bg-panel text-gray-12"
    >
      {c.image ? (
        <Image
          src={c.image}
          alt=""
          className="aspect-2/1 w-full object-cover"
        />
      ) : (
        <div className="aspect-2/1 w-full bg-gray-3" />
      )}
      <div className="flex flex-col gap-2.5 p-4">
        <span className="text-lg font-bold">{c.name}</span>
        {goal != null && <GoalBar raised={c.raised} goal={goal} />}
        <span className="text-sm text-gray-11">
          {goal != null
            ? `${to_usd(c.raised)} of ${to_usd(goal)}`
            : `${to_usd(c.raised)} raised`}
        </span>
      </div>
    </Link>
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
          <p className="order-4 text-sm text-gray-11 lg:order-none">
            We couldn't load this nonprofit's programs right now. Please try
            again later.
          </p>
        }
      >
        {(p) =>
          p.length === 0 ? null : (
            <section className="order-4 flex flex-col gap-4 lg:order-none">
              <h2 className={h2}>Programs</h2>
              <ul className="divide-y overflow-hidden rounded border bg-panel">
                {p.map((prog) => (
                  <li key={prog.id}>
                    <Link
                      to={program_href(npo, prog.id)}
                      className="flex min-h-11 items-center gap-4 p-4 text-gray-12"
                    >
                      {prog.banner ? (
                        <Image
                          src={prog.banner}
                          alt=""
                          className="h-11 w-16 shrink-0 rounded object-cover sm:h-16 sm:w-24"
                        />
                      ) : (
                        <span className="h-11 w-16 shrink-0 rounded bg-gray-3 sm:h-16 sm:w-24" />
                      )}
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="font-bold">{prog.title}</span>
                        <span className="truncate text-sm text-gray-11 max-sm:hidden">
                          {to_text(prog.description_pt)}
                        </span>
                      </span>
                      <ChevronRight
                        aria-hidden
                        className="icon-md shrink-0 text-gray-11"
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
}

function Media({ media }: IMediaProps) {
  return (
    <Suspense fallback={null}>
      <Await
        resolve={media}
        errorElement={
          <p className="order-5 text-sm text-gray-11 lg:order-none">
            We couldn't load this nonprofit's videos right now. Please try again
            later.
          </p>
        }
      >
        {(m) => {
          if (m.length === 0) return null;
          const [first, ...rest] = m;
          return (
            <section className="order-5 flex flex-col gap-4 lg:order-none">
              <h2 className={h2}>Media</h2>
              <Medium {...first} />
              {rest.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-3">
                  {rest.map((v) => (
                    <Medium key={v.id} {...v} />
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

function Medium(m: IMedia) {
  if (!extract_youtube_id(m.url)) {
    return (
      <ExtLink href={m.url} className="link break-all">
        {m.url}
      </ExtLink>
    );
  }
  return <Video url={m.url} />;
}

interface IMessages {
  messages: IMessage[];
}

function Messages({ messages }: IMessages) {
  if (messages.length === 0) return null;
  return (
    <section className="order-6 flex flex-col gap-3 lg:order-none">
      <h2 className="text-xl font-bold lg:text-base">Donor messages</h2>
      {messages.map((m) => (
        <figure
          key={m.id}
          className="flex flex-col gap-2 rounded border bg-band p-4"
        >
          <figcaption className="text-sm font-bold">{m.name}</figcaption>
          <blockquote className="break-words">{m.message}</blockquote>
        </figure>
      ))}
    </section>
  );
}

function Details({ npo }: INpoProps) {
  const active_in =
    npo.active_in_countries.length > 0
      ? npo.active_in_countries.join(", ")
      : npo.hq_country;
  const sdgs = (npo.sdgs ?? []) as UnSdgNum[];
  return (
    <section className="card order-7 flex flex-col gap-4 lg:order-none">
      <h2 className="text-base font-bold">Organization details</h2>
      <dl className="flex flex-col gap-3.5">
        {npo.registration_number && (
          <Detail term="EIN / Registration">{npo.registration_number}</Detail>
        )}
        {npo.street_address && (
          <Detail term="Address">{npo.street_address}</Detail>
        )}
        {active_in && <Detail term="Active in">{active_in}</Detail>}
        {sdgs.length > 0 && (
          <Detail term="Goals">
            <span className="flex flex-wrap gap-1.5">
              {sdgs.map((n) => (
                <span
                  key={n}
                  className="rounded-full bg-gray-3 px-2.5 py-1 text-sm font-semibold"
                >
                  {unsdgs[n].title}
                </span>
              ))}
            </span>
          </Detail>
        )}
      </dl>
    </section>
  );
}

interface IDetail {
  term: string;
  children: ReactNode;
}

function Detail({ term, children }: IDetail) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-bold uppercase tracking-badge text-gray-11">
        {term}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}
