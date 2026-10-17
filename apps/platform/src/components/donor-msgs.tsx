import { Image } from "@better-giving/ui";
import use_swr from "swr/immutable";
import laira from "#/assets/laira/laira-face.png";

interface Props {
  classes?: string;
  id: string;
  campaign_id?: string;
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

export function DonorMsgs({ classes = "", id, campaign_id }: Props) {
  const { data, mutate, error } = use_swr(
    ["txs", id, null, campaign_id ?? null],
    fetcher
  );

  if (error || !data) return null;
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
    <div className={`${classes} w-full rounded @container`}>
      <h2 className="text-xl font-bold mb-2">Donors</h2>
      <div className="grid gap-y-4 sm:grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-4">
        {items.map((donor) => (
          <div key={donor.id} className="card flex items-start gap-4">
            <Image
              src={donor.photo || laira}
              alt={donor.name}
              height={35}
              width={35}
              className="shrink-0 object-contain rounded-full"
            />

            <div>
              <p className="text-nowrap text-sm font-semibold">
                {donor.donor_name}
              </p>
              {donor.donor_message && (
                <p className="text-gray-11 mt-1">{donor.donor_message}</p>
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
    </div>
  );
}
