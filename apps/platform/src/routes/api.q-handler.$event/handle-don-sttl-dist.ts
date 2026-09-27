import type { IDonationSettled } from "@/donations";
import { msg } from "@/queue";
import { don_dist, enqueue } from "$/kit/queue";
import { partition_destinations } from "./partition-destinations";

// partitions donation into per-npo destinations, enqueues each to don-dist-q
export async function handle_don_sttl_dist(don: IDonationSettled) {
  const { destinations } = await partition_destinations(don);
  if (destinations.length) await don_dist(destinations);

  // a fund's receipt lists the members this split pays: membership can move
  // before the dists land, and they land one at a time. `settle_msgs` leaves
  // the fund receipt to this handler. queued even when empty, so the receipt
  // handler fails on a gift nobody was paid from. a split that throws before
  // here queues no receipt: one naming members nobody paid would be wrong too.
  if (don.to_type === "fund") {
    const to_paid = destinations.map((d) => d.id);
    await enqueue(msg("don-sttl-receipt", { ...don, to_paid }));
  }
}
