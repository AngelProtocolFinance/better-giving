import use_swr from "swr/immutable";
import laira from "#/assets/laira/laira-face.png";
import { Image } from "./image";

interface Props {
  classes?: string;
  id: string;
}

interface Page {
  items: any[];
  next: string | null;
}

const fetcher = ([, id, key]: [string, string, string | null]) =>
  fetch(`/api/npo/${id}/donors${key ? `?next=${key}` : ""}`).then<Page>((res) =>
    res.json()
  );

export function DonorMsgs({ classes = "", id }: Props) {
  const { data, mutate, error } = use_swr(["txs", id, null], fetcher);

  if (error || !data) return null;
  const { items, next } = data;
  if (items.length === 0) return null;

  async function load(next: string) {
    const res = await fetcher(["txs", id, next]);
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
          <div
            key={donor.id}
            className="flex bg-card items-start gap-4 border p-4 rounded"
          >
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
                <p className="text-muted-fg mt-1">{donor.donor_message}</p>
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
