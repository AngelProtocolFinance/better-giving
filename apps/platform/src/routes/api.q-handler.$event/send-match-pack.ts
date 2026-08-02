import {
  donation_match_pack,
  type IDonation as IDon,
  type IDonor,
} from "emails";
import type { IDonation } from "@/donations";
import { to_pretty_utc } from "@/helpers/date";
import { to_amount } from "@/helpers/email";
import { from_full } from "@/helpers/name";
import { send_email } from "$/email";

/**
 * the filing pack — what a donor copies into their employer's matching-gift
 * form.
 *
 * `employer_name` comes from the caller, not from the donation row, because it
 * is the donor's own input echoed back and nothing here resolves it against
 * anything. we hold no data about any employer's program, so there is nothing
 * else to look up.
 */
export async function send_match_pack(d: IDonation, employer_name: string) {
  const don: IDon = {
    id: d.id,
    date: to_pretty_utc(d.created_at),
    // the base gift, not the tip — the tip is a separate donation to Better
    // Giving and is not what an employer matches
    amount: to_amount(d.amount.base, d.amount.base / d.upusd, d.currency),
    to_name: d.to_name,
  };
  const from: IDonor = {
    first_name: from_full(d.from_name).fn || "there",
    full_name: d.from_name || "Valued Donor",
  };

  const data: donation_match_pack.IData = { ...don, from, employer_name };
  const { node, subject } = donation_match_pack.template(data);
  const res = await send_email({ node, subject, to: [d.from_email] });

  // `send_email` never throws — a provider refusal comes back as `data: null`.
  // logged rather than rethrown: the caller already burnt the send stamp, so a
  // retry would find the claim lost and mail nothing anyway.
  if (!res.data) {
    console.error("match pack NOT sent:", d.id, res.error);
    return res;
  }
  console.info("sent match pack:", res.data.id, d.id);
  return res;
}
