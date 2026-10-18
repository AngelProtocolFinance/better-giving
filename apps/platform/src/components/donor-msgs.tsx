import { Image } from "@better-giving/ui";
import { to_usd } from "@better-giving/ui/helpers";
import { useRef, useState } from "react";
import use_swr from "swr/immutable";
import laira from "#/assets/laira/laira-face.png";

export interface IDonorHighlight {
  name: string;
  amount: string;
  message?: string;
  photo?: string;
}

interface Props {
  classes?: string;
  id: string;
  campaign_id?: string;
  /** campaign page stays one column until lg. other walls keep sm. */
  columns?: "sm" | "lg";
  /** omitted: the donor wall. `"feed"`: one column, no heading. */
  layout?: "wall" | "feed";
  /** feed only. one card above the fetched list. */
  highlight?: IDonorHighlight;
}

interface Page {
  items: any[];
  next: string | null;
}

const fetcher = ([, id, key, campaign_id]: [
  string,
  string,
  string | null,
  string | null,
]) => {
  const q = new URLSearchParams();
  if (key) q.set("next", key);
  if (campaign_id) q.set("campaign_id", campaign_id);
  const search = q.toString();
  return fetch(`/api/npo/${id}/donors${search ? `?${search}` : ""}`).then<Page>(
    (res) => res.json()
  );
};

function skeleton_lines() {
  return (
    <div className="flex flex-1 flex-col gap-2 pt-1">
      <span className="block h-3 w-2/5 rounded bg-gray-3" />
      <span className="block h-3 w-full rounded bg-gray-3" />
      <span className="block h-3 w-[72%] rounded bg-gray-3" />
    </div>
  );
}

function DonorCard({ donor }: { donor: any }) {
  return (
    <div className="card flex items-start gap-4">
      <Image
        src={donor.photo || donor.avatar_url || laira}
        alt={donor.donor_name || "Donor"}
        height={35}
        width={35}
        className="shrink-0 rounded-full object-cover"
      />
      <div className="min-w-0">
        <p className="break-words text-sm font-semibold">{donor.donor_name}</p>
        {donor.donor_message && (
          <p className="mt-1 break-words text-gray-11">{donor.donor_message}</p>
        )}
      </div>
    </div>
  );
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

function relative_time(date: string | Date | null | undefined): string | null {
  if (date == null || date === "") return null;
  const then = date instanceof Date ? date : new Date(date);
  const stamp = then.getTime();
  if (Number.isNaN(stamp)) return null;
  // calendar days, so a DST shift does not turn yesterday into "2 days ago"
  const start = (d: Date) =>
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((start(new Date()) - start(then)) / DAY_MS);
  if (days <= 0) {
    const hours = Math.floor((Date.now() - stamp) / HOUR_MS);
    if (hours < 1) return "Less than an hour ago";
    if (hours === 1) return "1 hour ago";
    return `${hours} hours ago`;
  }
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

interface IFeedDonor {
  id: string;
  donor_name?: string | null;
  donor_message?: string | null;
  photo?: string | null;
  avatar_url?: string | null;
  amount?: number | null;
  date?: string | Date | null;
}

// bg-gray-2, not bg-panel: panel + border + radius + padding is the card shell the sweep rejects
const feed_card =
  "items-start gap-3 rounded border border-gray-6 bg-gray-2 p-3";

function FeedCard({
  donor,
  collapsed,
}: {
  donor: IFeedDonor;
  collapsed: boolean;
}) {
  const name = donor.donor_name || "Donor";
  const time = relative_time(donor.date);
  const amount = typeof donor.amount === "number" ? to_usd(donor.amount) : null;
  return (
    <article
      className={
        collapsed
          ? `hidden min-[1440px]:flex ${feed_card}`
          : `flex ${feed_card}`
      }
    >
      <Image
        src={donor.photo || donor.avatar_url || laira}
        alt=""
        height={40}
        width={40}
        className="size-10 shrink-0 rounded-full object-cover"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 break-words text-sm font-semibold">{name}</p>
          {amount && (
            <p className="shrink-0 text-sm font-bold text-success-subtle-fg">
              {amount}
            </p>
          )}
        </div>
        {donor.donor_message && (
          <p className="break-words text-sm text-gray-11">
            {donor.donor_message}
          </p>
        )}
        {time && <p className="text-sm text-gray-11">{time}</p>}
      </div>
    </article>
  );
}

function HighlightCard({ highlight }: { highlight: IDonorHighlight }) {
  return (
    <article className="flex items-start gap-3 rounded border border-green-6 bg-green-3 p-3">
      <Image
        src={highlight.photo || laira}
        alt=""
        height={40}
        width={40}
        className="size-10 shrink-0 rounded-full object-cover"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 break-words text-sm font-semibold">
            {highlight.name}
          </p>
          <p className="shrink-0 text-sm font-bold text-success-subtle-fg">
            {highlight.amount}
          </p>
        </div>
        {highlight.message && (
          <p className="break-words text-sm text-gray-11">
            {highlight.message}
          </p>
        )}
        <p className="text-sm text-gray-11">Just now</p>
      </div>
    </article>
  );
}

export function DonorMsgs({
  classes = "",
  id,
  campaign_id,
  columns = "sm",
  layout = "wall",
  highlight,
}: Props) {
  const { data, mutate, error } = use_swr(
    ["txs", id, null, campaign_id ?? null],
    fetcher
  );
  const [open_id, set_open_id] = useState<string | null>(null);
  const expanded = open_id === id;
  const loading = useRef(false);

  const campaign = campaign_id != null;
  const section = campaign
    ? {
        "data-group": "donors",
        "data-section": "donors",
        "data-shell": "",
        "data-block": "donors",
      }
    : {};
  const grid =
    columns === "lg"
      ? "grid gap-4 lg:grid-cols-[repeat(auto-fill,minmax(20rem,1fr))]"
      : "grid gap-y-4 sm:grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-4";

  const feed = layout === "feed";

  if (error) {
    if (!(feed && highlight)) return null;
  }
  if (!data) {
    if (feed) {
      if (!highlight) return null;
      return (
        <section data-feed="" className={`${classes} flex flex-col gap-3`}>
          <HighlightCard highlight={highlight} />
        </section>
      );
    }
    return (
      <section
        className={`${classes} w-full rounded @container`}
        aria-busy="true"
        {...section}
      >
        <h2
          className="text-xl font-bold mb-2"
          {...(campaign ? { "data-heading": "" } : {})}
        >
          Donors
        </h2>
        <div className={grid}>
          {["a", "b", "c"].map((key) => (
            <div key={key} className="card flex items-start gap-4">
              <span className="size-[35px] shrink-0 rounded-full bg-gray-3" />
              {skeleton_lines()}
            </div>
          ))}
        </div>
      </section>
    );
  }
  const items = data?.items ?? [];
  const next = data?.next ?? null;
  if (items.length === 0 && !(feed && highlight)) return null;

  async function load(page: string) {
    if (loading.current) return;
    loading.current = true;
    try {
      const res = await fetcher(["txs", id, page, campaign_id ?? null]);
      mutate(
        (x) => ({
          items: [...(x?.items || []), ...res.items],
          next: res.next,
        }),
        { revalidate: false }
      );
    } finally {
      loading.current = false;
    }
  }

  if (feed) {
    const cap = 6 - (highlight ? 1 : 0);
    const overflow = items.length > cap;
    return (
      <section data-feed="" className={`${classes} flex flex-col gap-3`}>
        {highlight && <HighlightCard highlight={highlight} />}
        {items.map((donor, i) => (
          <FeedCard
            key={donor.id}
            donor={donor}
            collapsed={!expanded && i >= cap}
          />
        ))}
        {(next || (overflow && !expanded)) && (
          <button
            type="button"
            onClick={() => {
              set_open_id(id);
              if (next) load(next);
            }}
            className={`min-h-11 text-left text-base font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring${next ? "" : " min-[1440px]:hidden"}`}
          >
            See all donors
          </button>
        )}
      </section>
    );
  }

  return (
    <section className={`${classes} w-full rounded @container`} {...section}>
      <h2
        className="text-xl font-bold mb-2"
        {...(campaign ? { "data-heading": "" } : {})}
      >
        Donors
      </h2>
      <div className={grid}>
        {items.map((donor) => (
          <DonorCard key={donor.id} donor={donor} />
        ))}
      </div>

      {next && (
        <button
          type="button"
          onClick={() => load(next)}
          className="text-primary font-medium mt-4 hover:text-primary"
        >
          View more
        </button>
      )}
    </section>
  );
}
