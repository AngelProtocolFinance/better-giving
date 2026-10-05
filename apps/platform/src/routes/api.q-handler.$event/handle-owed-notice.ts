import { owed_npo_notif, owed_referrer_notif } from "emails";
import { report_error } from "#/errors/report";
import { emails } from "@/constants/common";
import { to_utc_day } from "@/helpers/date";
import type { IOwedNoticePayload } from "@/queue";
import { send_email_or_throw } from "$/email";
import { base_url } from "$/env";
import type { DbOrTx } from "$/pg/queries/helpers";
import { npo_by_rid, npo_get } from "$/pg/queries/npo";
import type { OwedParty } from "$/pg/queries/owed";
import {
  claim_owed_notice,
  mark_owed_notice_sent,
  type OwedNoticeClaim,
  release_owed_notice,
} from "$/pg/queries/owed-notice";
import { npo_admins, user_by_referral_code } from "$/pg/queries/user";

/**
 * a party's mail about one owed row, sent once under the notice's lease. the
 * row is read at send time, so the mail carries its figures as they stand
 * then rather than as the producer saw them.
 */
export async function handle_owed_notice(db: DbOrTx, p: IOwedNoticePayload) {
  const claim = await claim_owed_notice(p.id, db);
  // done (sent, or a `recorded` whose row no longer owes) and busy both ack:
  // a retry would hold up the shared FIFO queue behind its backoff, and the
  // cron enqueues a held notice again once its lease runs out unsent
  if (claim.status !== "claimed") return;

  try {
    await send_notice(claim);
  } catch (e) {
    // the send's error is the one that has to survive; a failed release keeps
    // the claim until its lease runs out
    await release_owed_notice(p.id, claim.stamp, db).catch((re) =>
      report_error(re, { notice_id: p.id, during: "owed notice release" })
    );
    throw e;
  }
  // the mail went: an unstamped notice is sent again once its lease runs out
  await mark_owed_notice_sent(p.id, db);
}

type IClaimed = Extract<OwedNoticeClaim, { status: "claimed" }>;

async function send_notice(c: IClaimed) {
  const { to, node, subject } = await mail_for(c.party, notice_data(c));
  // nobody to tell reaches ops instead: marking it sent unread would lose it
  await send_email_or_throw({
    node,
    subject,
    ...(to.length === 0 ? { to: [emails.hi] } : { to, bcc: [emails.hi] }),
  });
}

type INoticeData = Omit<owed_npo_notif.IData, "to_name" | "history_url">;

/** the party's addresses, and its mail linking to its own history page */
async function mail_for(party: OwedParty, data: INoticeData) {
  if ("npo_id" in party) {
    const npo = await npo_get(party.npo_id);
    return {
      to: await admin_emails(party.npo_id),
      ...owed_npo_notif.template({
        ...data,
        to_name: npo?.name ?? "there",
        history_url: `${base_url}/admin/${party.npo_id}/dashboard/grants`,
      }),
    };
  }
  if ("referrer_npo" in party) {
    const npo = await npo_by_rid(party.referrer_npo);
    return {
      to: npo ? await admin_emails(npo.id) : [],
      ...owed_referrer_notif.template({
        ...data,
        to_name: npo?.name ?? "there",
        history_url: `${base_url}/admin/${npo?.id}/referrals/payouts`,
      }),
    };
  }
  const u = await user_by_referral_code(party.referrer_user);
  return {
    to: u ? [u.email] : [],
    ...owed_referrer_notif.template({
      ...data,
      to_name: u?.first_name || "there",
      history_url: `${base_url}/dashboard/referrals/payouts`,
    }),
  };
}

/** a failed lookup throws: mailing ops alone would mark the party's notice sent */
const admin_emails = async (npo_id: number) =>
  (await npo_admins(npo_id)).map((a) => a.email);

const notice_data = ({ kind, round, row: r }: IClaimed): INoticeData => ({
  kind,
  round,
  gift: {
    id: r.donation_id,
    date: to_utc_day(r.gift_date),
    amount: { value: r.gift_amount, currency: r.gift_currency },
  },
  source: r.source,
  recorded_at: to_utc_day(r.recorded_at),
  received_usd: r.received_usd,
  fee_processing_usd: r.fee_processing_usd,
  fee_dispute_usd: r.fee_dispute_usd,
  refund_failed_usd: r.refund_failed_usd,
  credited_back_usd: r.credited_back_usd,
  credited_back_at: r.credited_back_at
    ? to_utc_day(r.credited_back_at)
    : undefined,
  recovered_usd: r.recovered_usd,
  written_off_usd: r.written_off_usd,
  written_off_at: r.written_off_at ? to_utc_day(r.written_off_at) : undefined,
  outstanding_usd: r.outstanding_usd,
});
