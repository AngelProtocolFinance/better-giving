import type { IDonMatchPayload } from "@/queue";
import { donation_get } from "$/pg/queries/donation";
import { claim_pack_send, open_match_event } from "$/pg/queries/match";
import { send_match_pack } from "./send-match-pack";

/**
 * mail the filing pack to a donor who named an employer.
 *
 * no employer is resolved and no branch is taken on who they named: we hold no
 * data about any employer's matching program, so a donor who typed anything
 * non-empty gets the one pack, and the pack tells them where the real terms
 * live. the payload having reached here is the whole eligibility test.
 *
 * the donation is read *before* the event is opened, so a transient read
 * failure costs a retry rather than the donor's mail — see the claim below for
 * why anything that throws after it is expensive.
 */
export async function handle_don_match(p: IDonMatchPayload) {
  const don = await donation_get(p.id);
  if (!don) throw new Error(`donation not found: ${p.id}`);

  // `donation_get` also resolves legacy v1 ids; every write below keys off the
  // row's own id, which is what the event's foreign key points at.
  await open_match_event(don.id);

  // the stamp is burnt before the send, deliberately. two concurrent
  // deliveries both reaching the send would both mail the donor, and there is
  // no unsend — so the claim goes first and the loser stops here. the price is
  // that a provider refusal costs the donor that mail: nothing re-drives it,
  // because from the stamp's point of view it was already sent. a later commit
  // makes that loss queryable rather than silent.
  const claimed = await claim_pack_send(don.id);

  // not an error: this is a redelivery of a message whose pack already went
  // out, and qstash needs a 200 for it or it will keep retrying.
  if (!claimed) return;

  await send_match_pack(don, p.from_company_name);
}
