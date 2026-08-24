import { msg } from "@/queue";
import { enqueue } from "$/kit/queue";
import { db } from "$/pg/db";
import { reg_get, reg_update } from "$/pg/queries/registration";
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

  /* a packet the row has moved on from — the applicant changed the legal
   * identity, or the contact the agreement names, and both reset paths cleared
   * the eid along with the two urls. writing this one back would resurrect the
   * superseded document: `is_fsa_doc_eid` matches a signed url by its last
   * segment, so it becomes downloadable again by whoever holds the link, and
   * the row reads as signed when nothing signed the identity it now carries.
   *
   * a row predating `o_fsa_doc_eid` has no eid to compare against, so it is
   * recognised by the signing url the same reset paths clear. */
  const in_flight = prev.o_fsa_doc_eid
    ? prev.o_fsa_doc_eid === documentGroup.eid
    : !!prev.o_fsa_signing_url;
  if (!in_flight) return;

  const fsa_url = `${base_url}/api/anvil-doc/${documentGroup.eid}`;
  const updated = await reg_update(db, id, {
    o_fsa_signed_doc_url: fsa_url,
    status: "01",
  });
  if (updated) await enqueue(msg("reg-updated", updated));
  return fsa_url;
};
