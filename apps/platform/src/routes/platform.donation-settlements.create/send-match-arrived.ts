import { donation_match_arrived } from "emails";
import type { IDonation } from "@/donations";
import { to_amount } from "@/helpers/email";
import { from_full } from "@/helpers/name";
import { send_email } from "$/email";

/**
 * tell the donor their employer's match landed.
 *
 * the only mail this arrival produces. the employer gets nothing: they are not
 * the donor, we hold no consent and no address for them, and the money is not
 * theirs to be receipted for — see the call site.
 *
 * `gift` is the donor's *original* donation, not the employer's new row: the
 * recipient, the beneficiary and the link all come from the gift being matched.
 * `net` is what actually arrived, which is the only figure the mail states.
 */
export async function send_match_arrived(gift: IDonation, net: number) {
  const data: donation_match_arrived.IData = {
    donation_id: gift.id,
    // manual settlements are USD-only, so the usd value is the value
    amount: to_amount(net, net, "USD"),
    to_name: gift.to_name,
    from: {
      first_name: from_full(gift.from_name).fn || "there",
      full_name: gift.from_name || "Valued Donor",
    },
    // the donor's own input, echoed back. absent when they named no employer —
    // the admin's internal reference stands in for the donation row's name, and
    // is not something to show a donor as their employer.
    employer_name: gift.from_company_name || undefined,
  };

  const { node, subject } = donation_match_arrived.template(data);
  const res = await send_email({ node, subject, to: [gift.from_email] });

  // `send_email` never throws — a provider refusal comes back as `data: null`.
  // logged rather than rethrown: the money has already moved and committed, and
  // failing the settlement over a mail would leave the admin re-keying a check
  // that was in fact recorded.
  if (!res.data) {
    console.error("match arrival NOT sent:", gift.id, res.error);
    return res;
  }
  console.info("sent match arrival:", res.data.id, gift.id);
  return res;
}
