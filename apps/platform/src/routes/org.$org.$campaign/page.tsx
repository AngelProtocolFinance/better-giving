import { ExtLink, Image, Modal } from "@better-giving/ui";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { DonorMsgs, type IDonorHighlight } from "#/components/donor-msgs";
import { DappLogo } from "#/components/image";
import { RichText } from "#/components/rich-text";
import { extract_youtube_id } from "#/components/youtube-player";
import { Share } from "#/routes/_app.fundraisers.$fund_id/share";
import { Video } from "#/routes/_app.fundraisers.$fund_id/video";
import type { RichTextContent } from "#/types/components";

const ring =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const donate_inline = `h-16 w-full rounded bg-primary text-2xl font-semibold text-primary-fg hover:bg-blue-10 ${ring}`;
const donate_header = `h-11 shrink-0 rounded bg-primary px-4 text-base font-semibold text-primary-fg hover:bg-blue-10 ${ring}`;
const donate_bar = `h-12 min-w-0 flex-1 rounded bg-primary text-base font-semibold text-primary-fg hover:bg-blue-10 ${ring}`;
const close_btn = `grid size-11 place-items-center rounded text-2xl leading-none text-gray-12 ${ring}`;

export interface ICampaignPage {
  title: string;
  org_name: string;
  org_href: string;
  logo: string | null;
  legal?: string;
  website?: { href: string; label: string };
  tag: string | null;
  program_name: string | null;
  hero: string | null;
  hero_alt: string;
  story: RichTextContent;
  videos: { url: string; title?: string }[];
  raised_line: string;
  bar: { raised: number; goal: number } | null;
  donor_line: string;
  no_gifts: boolean;
  open: boolean;
  ended_body: string | null;
  thanks?: { amount: string };
  highlight?: IDonorHighlight;
  donors: { id: string; campaign_id: string };
  form: ReactNode;
  initial_dialog_open?: boolean;
  share: { recipientName: string; url: string };
}

export function CampaignPage(props: ICampaignPage) {
  const [dialog, set_dialog] = useState(
    props.open && props.initial_dialog_open === true
  );
  const [away, set_away] = useState(false);
  const donate_ref = useRef<HTMLButtonElement>(null);
  const close_ref = useRef<HTMLButtonElement>(null);
  const open_dialog = () => set_dialog(true);

  useEffect(() => {
    const node = donate_ref.current;
    if (!props.open || !node) {
      set_away(false);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        set_away(entry ? !entry.isIntersecting : false);
      },
      { threshold: 0.5 }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [props.open]);

  const sticky = props.open && away;

  return (
    <>
      <div
        inert={dialog ? true : undefined}
        className="min-h-[100dvh] bg-background text-gray-12"
      >
        {sticky && (
          <header
            data-sticky="header"
            className="fixed inset-x-0 top-0 z-sticky hidden h-14 border-b border-gray-6 bg-gray-1 min-[1440px]:flex"
          >
            <div className="mx-auto flex h-full w-full items-center justify-between gap-3 min-[1440px]:w-[1224px]">
              <p className="min-w-0 truncate text-base font-semibold">
                {props.title}
              </p>
              <button
                type="button"
                onClick={open_dialog}
                className={donate_header}
              >
                Donate
              </button>
            </div>
          </header>
        )}
        <div className="mx-auto w-full px-5 pt-4 pb-12 min-[1440px]:w-[1224px] min-[1440px]:px-0 min-[1440px]:pt-8 min-[1440px]:pb-16">
          <div className="flex flex-col gap-10 min-[1440px]:grid min-[1440px]:grid-cols-[800px_392px] min-[1440px]:items-start min-[1440px]:gap-8">
            <div
              data-col="story"
              className="contents min-[1440px]:flex min-[1440px]:min-w-0 min-[1440px]:flex-col min-[1440px]:gap-10"
            >
              <Mast {...props} />
              {props.hero && (
                <Image
                  src={props.hero}
                  alt={props.hero_alt}
                  className="order-5 aspect-video w-full rounded object-cover min-[1440px]:order-none"
                />
              )}
              <section
                aria-label="Story"
                className="order-6 min-[1440px]:order-none"
              >
                <RichText
                  readOnly
                  content={props.story}
                  classes={{
                    field:
                      "flex w-full flex-col gap-4 text-base font-normal leading-relaxed",
                  }}
                />
              </section>
              {props.videos.length > 0 && <Videos videos={props.videos} />}
            </div>
            <div
              data-col="action"
              className="contents min-[1440px]:flex min-[1440px]:min-w-0 min-[1440px]:flex-col min-[1440px]:gap-6 min-[1440px]:has-[[data-feed]]:gap-10"
            >
              <Notice {...props} />
              <div className="order-4 flex flex-col gap-2 min-[1440px]:order-none">
                {props.open && (
                  <button
                    ref={donate_ref}
                    type="button"
                    onClick={open_dialog}
                    className={donate_inline}
                  >
                    Donate
                  </button>
                )}
                <Share
                  trigger="button"
                  recipientName={props.share.recipientName}
                  url={props.share.url}
                />
              </div>
              <Progress {...props} />
              <DonorMsgs
                layout="feed"
                classes="order-8 min-[1440px]:order-none"
                id={props.donors.id}
                campaign_id={props.donors.campaign_id}
                highlight={props.highlight}
              />
            </div>
          </div>
          <footer className="mt-10 flex w-full items-center gap-3 border-t py-6 min-[1440px]:mt-16">
            <DappLogo classes="h-8" />
            <span className="text-sm font-semibold">Better Giving</span>
          </footer>
        </div>
        {sticky && (
          <div
            data-sticky="bar"
            className="fixed inset-x-0 bottom-0 z-sticky flex gap-2 border-t border-gray-6 bg-gray-1 px-5 py-3 min-[1440px]:hidden"
          >
            <Share
              trigger="button"
              classes="min-w-0 flex-1"
              recipientName={props.share.recipientName}
              url={props.share.url}
            />
            <button type="button" onClick={open_dialog} className={donate_bar}>
              Donate
            </button>
          </div>
        )}
      </div>
      <Modal
        open={dialog}
        onClose={() => set_dialog(false)}
        size="donate"
        classes="bg-surface"
        scrim="bg-gray-12/56"
        title="Donate"
        initialFocusEl={() => close_ref.current}
      >
        <div className="flex shrink-0 justify-end bg-surface px-2 pt-2 sm:sticky sm:top-0 sm:z-sticky">
          <button
            ref={close_ref}
            type="button"
            aria-label="Close"
            onClick={() => set_dialog(false)}
            className={close_btn}
          >
            ×
          </button>
        </div>
        <div className="max-sm:flex max-sm:min-h-0 max-sm:flex-1 max-sm:flex-col max-sm:overflow-y-auto max-sm:scrollbars">
          {props.form}
        </div>
      </Modal>
    </>
  );
}

function Mast(props: ICampaignPage) {
  return (
    <div className="order-2 flex flex-col gap-3 min-[1440px]:order-none">
      <div className="order-2 flex items-center gap-3 min-[1440px]:order-1">
        {props.logo && (
          <Image
            src={props.logo}
            alt=""
            width={48}
            height={48}
            className="size-12 shrink-0 rounded-full border border-gray-6 object-cover"
          />
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link
            to={props.org_href}
            className={`min-w-0 text-base font-semibold text-gray-12 hover:text-primary ${ring}`}
          >
            {props.org_name}
          </Link>
          {(props.legal || props.website) && (
            <p className="text-sm text-gray-11">
              {props.legal}
              {props.legal && props.website ? " · " : null}
              {props.website && (
                <ExtLink
                  href={props.website.href}
                  className="link font-semibold underline"
                >
                  {props.website.label}
                </ExtLink>
              )}
            </p>
          )}
        </div>
      </div>
      <h1 className="order-1 text-3xl font-bold tracking-tight text-balance break-words min-[1440px]:order-2 min-[1440px]:text-4xl">
        {props.title}
      </h1>
      {(props.tag || props.program_name) && (
        <div className="order-3 flex flex-wrap gap-2">
          {props.tag && (
            <p className="inline-block rounded bg-secondary px-2 py-1 text-xs font-semibold uppercase tracking-badge text-primary-deep">
              {props.tag}
            </p>
          )}
          {props.program_name && (
            <p className="inline-block max-w-full rounded bg-gray-3 px-2 py-1 text-sm font-medium break-words text-gray-12">
              {props.program_name}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Notice(props: ICampaignPage) {
  if (!props.open && props.ended_body) {
    return (
      <section className="order-1 min-[1440px]:order-none">
        <div className="rounded border border-gray-6 bg-panel">
          <div className="flex flex-col gap-2 p-4">
            <h2 className="text-xl font-bold">Giving has ended</h2>
            <p>{props.ended_body}</p>
          </div>
        </div>
      </section>
    );
  }
  if (props.open && props.thanks) {
    return (
      <section className="order-1 flex flex-col gap-2 rounded border border-green-6 bg-green-2 p-4 min-[1440px]:order-none">
        <h2 className="text-xl font-bold">Thank you</h2>
        <p>Your {props.thanks.amount} gift is in.</p>
      </section>
    );
  }
  return null;
}

function Progress(props: ICampaignPage) {
  return (
    <div className="order-3 flex flex-col gap-2 min-[1440px]:order-none">
      <p className="text-base">{props.raised_line}</p>
      {props.bar && (
        <RaisedBar raised={props.bar.raised} goal={props.bar.goal} />
      )}
      <p className="text-base">{props.donor_line}</p>
      {props.no_gifts && <p className="text-base">No gifts yet</p>}
    </div>
  );
}

function RaisedBar({ raised, goal }: { raised: number; goal: number }) {
  const [track, set_track] = useState<HTMLDivElement | null>(null);
  const [width, set_width] = useState(0);
  useEffect(() => {
    if (!track) return;
    const measure = () => set_width(track.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    return () => ro.disconnect();
  }, [track]);
  const ratio = goal > 0 ? Math.min(1, raised / goal) : 0;
  const tiny = raised > 0 && width > 0 && width * ratio < 4;
  const fill = raised <= 0 ? "0px" : tiny ? "4px" : `${ratio * 100}%`;
  return (
    <div
      ref={set_track}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={goal}
      aria-valuenow={Math.min(raised, goal)}
      aria-label="Amount raised"
      className={`h-2 w-full bg-gray-3 ${tiny ? "rounded-none" : "rounded"}`}
    >
      <div
        className={`h-full bg-success ${tiny ? "rounded-none" : "rounded"}`}
        style={{ width: fill }}
      />
    </div>
  );
}

function Videos({ videos }: { videos: ICampaignPage["videos"] }) {
  return (
    <section className="order-7 flex flex-col gap-2 min-[1440px]:order-none">
      <h2 className="text-xl font-bold">Videos</h2>
      {videos.map((video) =>
        extract_youtube_id(video.url) ? (
          <Video
            key={video.url}
            url={video.url}
            title={video.title ?? "Play video"}
          />
        ) : (
          <ExtLink key={video.url} href={video.url} className="link">
            {video.url}
          </ExtLink>
        )
      )}
    </section>
  );
}
