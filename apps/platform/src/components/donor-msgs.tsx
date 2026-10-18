import { Image } from "@better-giving/ui";
import use_swr from "swr/immutable";
import laira from "#/assets/laira/laira-face.png";

interface Props {
  classes?: string;
  id: string;
  campaign_id?: string;
  /** campaign page stays one column until lg. other walls keep sm. */
  columns?: "sm" | "lg";
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

export function DonorMsgs({
  classes = "",
  id,
  campaign_id,
  columns = "sm",
}: Props) {
  const { data, mutate, error } = use_swr(
    ["txs", id, null, campaign_id ?? null],
    fetcher
  );

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

  if (error) return null;
  if (!data) {
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
  const { items, next } = data;
  if (items.length === 0) return null;

  async function load(next: string) {
    const res = await fetcher(["txs", id, next, campaign_id ?? null]);
    mutate(
      (x) => ({
        items: [...(x?.items || []), ...res.items],
        next: res.next,
      }),
      { revalidate: false }
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
          <div key={donor.id} className="card flex items-start gap-4">
            <Image
              src={donor.photo || donor.avatar_url || laira}
              alt={donor.donor_name || "Donor"}
              height={35}
              width={35}
              className="shrink-0 rounded-full object-cover"
            />

            <div className="min-w-0">
              <p className="break-words text-sm font-semibold">
                {donor.donor_name}
              </p>
              {donor.donor_message && (
                <p className="mt-1 break-words text-gray-11">
                  {donor.donor_message}
                </p>
              )}
            </div>
          </div>
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
