import {
  type IOwedNotice,
  type IOwedParty,
  OwedNotice,
  owed_subject,
} from "../components/owed-notice";

/**
 * a referrer's notice about commission it owes back on a refunded or disputed
 * gift: when it is recorded, credited back, or waived. recovered from its
 * commission payouts, which is where its history of them shows too.
 */
export type IData = IOwedNotice;

const referrer: IOwedParty = {
  received_label: "Your commission",
  already_paid: "Your commission on this gift had already been paid to you",
  recovered_from: "your next commission payouts",
  repaid_with: "your next commission payout",
  history_label: "See it in your payout history",
};

export const template = (data: IData) => ({
  node: <OwedNotice n={data} party={referrer} />,
  subject: owed_subject(data),
});
