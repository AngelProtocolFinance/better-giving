import type { IInput } from "@/types/donation-dist";
import { enqueue } from "$/kit/queue";
import { db } from "$/pg/db";
import { settle_npo } from "$/settlement/settle-npo";

export type { IInput, ISource, ISttlmnt } from "@/types/donation-dist";

export const handle_npo = async (i: IInput): Promise<void> => {
  try {
    const { msgs } = await db.transaction((tx) => settle_npo(tx, i));
    if (msgs.length) {
      await enqueue(...msgs);
      console.info(`handled npo ${i.id}`);
    }
  } catch (e: any) {
    // unique(donation_id, to_id) — already settled, safe to skip
    if (e.code === "23505") return;
    throw e;
  }
};
