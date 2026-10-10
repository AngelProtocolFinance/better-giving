import {
  type IOwedNotice,
  type IOwedParty,
  OwedNotice,
  owed_subject,
} from "../components/owed-notice";

/**
 * a nonprofit's notice about an amount it owes back on a refunded or disputed
 * gift: when it is recorded, credited back, or waived. recovered from its
 * grants, which is where its history of them shows too.
 */
export type IData = IOwedNotice;

const npo: IOwedParty = {
  received_label: "You received",
  already_paid: "Your share of this gift had already been paid to you",
  recovered_from: "your next grants",
  repaid_with: "your next grant",
  history_label: "See it in your grant history",
};

export const template = (data: IData) => ({
  node: <OwedNotice n={data} party={npo} />,
  subject: owed_subject(data),
});
