import { msg } from "@/queue";
import { enqueue } from "$/kit/queue";
import { db } from "$/pg/db";
import { reg_get, reg_update } from "$/pg/queries/registration";
import { signer_fn } from "./helpers";
import type { EtchPacket } from "./types";

export const etch_complete = async (
  data: EtchPacket.Data,
  base_url: string
) => {
  const { signers, documentGroup } = data;
  const signer = await signer_fn(signers[0].eid);
  const id = signer.eid;

  const prev = await reg_get(id);
  if (!prev) throw new Error(`reg not found for ${id}`);

  const fsa_url = `${base_url}/api/anvil-doc/${documentGroup.eid}`;
  const updated = await reg_update(db, id, {
    o_fsa_signed_doc_url: fsa_url,
    status: "01",
  });
  if (updated) await enqueue(msg("reg-updated", updated));
  return fsa_url;
};
