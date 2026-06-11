import type { IDonationSettled } from "@/donations";
import { enqueue } from "$/kit/queue";
import type { DbOrTx } from "$/pg/queries/helpers";
import { settle_npo } from "$/settlement/settle-npo";
import { partition_destinations } from "./partition-destinations";

// test orchestrator: partition → settle each npo in caller's transaction
export async function settle_donation(db: DbOrTx, don: IDonationSettled) {
  const { destinations } = await partition_destinations(don);
  for (const dest of destinations) {
    const { msgs } = await settle_npo(db, dest);
    if (msgs.length) await enqueue(...msgs);
  }
}
