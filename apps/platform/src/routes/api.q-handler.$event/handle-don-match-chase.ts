import {
  donation_match_chase,
  type IDonation as IDon,
  type IDonor,
} from "emails";
import { to_pretty_utc } from "@/helpers/date";
import { to_amount } from "@/helpers/email";
import { from_full } from "@/helpers/name";
import type { IDonMatchChasePayload } from "@/queue";
import { send_email } from "$/email";
import { donation_get } from "$/pg/queries/donation";
import { claim_match_chase } from "$/pg/queries/match";

/**
 * the one reminder to file, three days after the pack.
 *
 * it fires off a delayed message armed at pack send, not off a sweep — there is
 * no cron here and nothing scans for events that went quiet. the price of that
 * is a message which arrives knowing nothing: the donor may have filed the same
 * afternoon, or a redelivery may already have chased them. so nothing in the
 * payload is trusted beyond the donation it names, and `claim_match_chase` is
 * what decides whether an email is owed at all.
 */
export async function handle_don_match_chase(p: IDonMatchChasePayload) {
  // read before the claim, so a transient failure costs this delivery rather
  // than the stamp — the same ordering the pack send uses
  const don = await donation_get(p.id);
  if (!don) throw new Error(`donation not found: ${p.id}`);

  // `donation_get` also resolves legacy v1 ids; the claim keys off the row's
  // own id, which is what the event's foreign key points at.
  const claimed = await claim_match_chase(don.id);

  // not an error, and the ordinary outcome by design: the donor filed, or a
  // redelivery already chased them, or no pack ever went out. qstash needs a
  // 200 for this message or it will keep retrying it.
  if (!claimed) {
    console.info(`match chase not owed: ${don.id}`);
    return;
  }

  const dn: IDon = {
    id: don.id,
    date: to_pretty_utc(don.created_at),
    // the base gift, not the tip — the tip is a separate donation to Better
    // Giving and is not what an employer matches
    amount: to_amount(
      don.amount.base,
      don.amount.base / don.upusd,
      don.currency
    ),
    to_name: don.to_name,
  };
  const from: IDonor = {
    first_name: from_full(don.from_name).fn || "there",
    full_name: don.from_name || "Valued Donor",
  };

  const data: donation_match_chase.IData = {
    ...dn,
    from,
    // re-read at fire time, like everything else here. the fallback is for a
    // name that was cleared after the pack went out; the copy is written so the
    // reminder still reads correctly without one.
    employer_name: don.from_company_name || "your employer",
  };
  const { node, subject } = donation_match_chase.template(data);
  const res = await send_email({ node, subject, to: [don.from_email] });

  // `send_email` never throws — a provider refusal comes back as `data: null`.
  // logged rather than rethrown: the stamp is already burnt, so a retry would
  // find the claim lost and mail nothing anyway.
  if (!res.data) {
    console.error("match chase NOT sent:", don.id, res.error);
    return;
  }
  console.info("sent match chase:", res.data.id, don.id);
}
