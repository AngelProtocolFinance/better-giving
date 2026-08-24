import { msg } from "@/queue";
import { enqueue } from "$/kit/queue";
import { reg_fsa_signed, reg_get } from "$/pg/queries/registration";
import { signer_fn } from "./helpers";
import type { EtchPacket } from "./types";

export const etch_complete = async (
  data: EtchPacket.Data,
  base_url: string
): Promise<string | undefined> => {
  const { signers, documentGroup } = data;
  const signer = await signer_fn(signers[0].eid);
  const id = signer.eid;

  const prev = await reg_get(id);
  if (!prev) throw new Error(`reg not found for ${id}`);

  const fsa_url = `${base_url}/api/anvil-doc/${documentGroup.eid}`;
  const updated = await reg_fsa_signed(id, documentGroup.eid, fsa_url);
  /* nothing written: the applicant changed the legal identity, or the contact
   * the agreement names, and the reset cleared the packet this webhook is
   * reporting on. it signed an identity the row no longer carries. */
  if (!updated) return;

  await enqueue(msg("reg-updated", updated));
  return fsa_url;
};
