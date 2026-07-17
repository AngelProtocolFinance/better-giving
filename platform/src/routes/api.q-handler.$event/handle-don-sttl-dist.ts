import type { IDonationSettled } from "@/donations";
import { don_dist } from "$/kit/queue";
import { partition_destinations } from "./partition-destinations";

// partitions donation into per-npo destinations, enqueues each to don-dist-q
export async function handle_don_sttl_dist(don: IDonationSettled) {
  const { destinations } = await partition_destinations(don);
  if (destinations.length) await don_dist(destinations);
}
