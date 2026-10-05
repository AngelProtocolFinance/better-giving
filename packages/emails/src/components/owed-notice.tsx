import { Text } from "react-email";
import { Hr } from "./hr";
import { KeyValue } from "./key-value";
import { Link } from "./link";
import { PublicLayout } from "./public-layout";

export type OwedNoticeKind = "recorded" | "credited" | "waived";

/**
 * a party's notice about one owed row: the gift it is on, why, the figures,
 * and how it is settled. names the gift by its transaction id only — never
 * the donor.
 */
export interface IOwedNotice {
  kind: OwedNoticeKind;
  /** greeting name: the nonprofit, or the referrer's first name */
  to_name: string;
  /** absolute: the party's own history page */
  history_url: string;
  gift: {
    /** the transaction id the receipt and the nonprofit's notice carry */
    id: string;
    /** pretty date */
    date: string;
    /** in the gift's own currency */
    amount: { value: number; currency: string };
  };
  source: "refund" | "dispute";
  /** pretty date the refund or dispute was recorded */
  recorded_at: string;
  received_usd: number;
  fee_processing_usd: number;
  fee_dispute_usd: number;
  credited_back_usd: number;
  /** pretty date */
  credited_back_at?: string;
  written_off_usd: number;
  /** pretty date */
  written_off_at?: string;
  /** negative: the party is due that much back */
  outstanding_usd: number;
}

/** the words that differ between a nonprofit's notice and a referrer's */
export interface IOwedParty {
  /** what the party got from the gift: "You received", "Your commission" */
  received_label: string;
  /** why it is owed back: the party's share had already gone out to it */
  already_paid: string;
  /** where recoveries come from: "your next grants" */
  recovered_from: string;
  /** where a due-back goes: "your next grant" */
  repaid_with: string;
  /** link text to the history page */
  history_label: string;
}

const usd = (n: number) => `$${n.toFixed(2)}`;

const gift_amount = ({ value, currency }: IOwedNotice["gift"]["amount"]) =>
  `${currency === "USD" ? value.toFixed(2) : value} ${currency}`;

const owed_total = (n: IOwedNotice) =>
  n.received_usd + n.fee_processing_usd + n.fee_dispute_usd;

/** a credit or write-off can leave a cent of float residue either side of 0 */
const settled = (outstanding: number) => Math.abs(outstanding) < 0.01;

export const owed_subject = (n: IOwedNotice): string => {
  switch (n.kind) {
    case "recorded":
      return `Amount owed on ${n.source === "refund" ? "a refunded" : "a disputed"} gift: ${n.gift.id}`;
    case "credited":
      return `Amount owed credited back: ${n.gift.id}`;
    case "waived":
      return `Amount owed waived: ${n.gift.id}`;
  }
};

export interface IOwedNoticeProps {
  n: IOwedNotice;
  party: IOwedParty;
}

export function OwedNotice({ n, party }: IOwedNoticeProps) {
  const gift = `${gift_amount(n.gift.amount)} gift made on ${n.gift.date}`;
  return (
    <PublicLayout>
      <Text>Hi {n.to_name},</Text>
      {n.kind === "recorded" && <Recorded n={n} party={party} gift={gift} />}
      {n.kind === "credited" && <Credited n={n} party={party} gift={gift} />}
      {n.kind === "waived" && <Waived n={n} party={party} gift={gift} />}

      <Hr />
      <h2 style={{ fontSize: 16, marginTop: 20 }}>The gift</h2>
      <KeyValue label="Transaction ID" value={n.gift.id} />
      <KeyValue label="Gift date" value={n.gift.date} />
      <KeyValue label="Gift amount" value={gift_amount(n.gift.amount)} />
      <KeyValue
        label={n.source === "refund" ? "Refunded" : "Disputed"}
        value={n.recorded_at}
      />

      <h2 style={{ fontSize: 16, marginTop: 20 }}>What is owed</h2>
      <KeyValue label={party.received_label} value={usd(n.received_usd)} />
      {n.fee_processing_usd > 0 && (
        <KeyValue
          label="Card processing fee"
          value={usd(n.fee_processing_usd)}
        />
      )}
      {n.fee_dispute_usd > 0 && (
        <KeyValue label="Dispute fee" value={usd(n.fee_dispute_usd)} />
      )}
      <KeyValue label="Total owed" value={usd(owed_total(n))} />

      <Text>
        <Link href={n.history_url}>{party.history_label}</Link>
      </Text>
    </PublicLayout>
  );
}

interface IBody {
  n: IOwedNotice;
  party: IOwedParty;
  /** "100.00 USD gift made on Nov 5, 2026" */
  gift: string;
}

function Recorded({ n, party, gift }: IBody) {
  return (
    <>
      <Text>
        {n.source === "refund"
          ? `On ${n.recorded_at}, the ${gift} was refunded to the donor.`
          : `On ${n.recorded_at}, the donor's bank opened a dispute on the ${gift}.`}{" "}
        {party.already_paid}, so <strong>{usd(owed_total(n))}</strong> is now
        owed back.
      </Text>
      <Text>
        We will deduct it from {party.recovered_from}. If one is smaller than
        what is owed, the rest comes out of the ones after it. You don't need to
        do anything.
      </Text>
      {n.source === "dispute" && (
        <Text>
          If the dispute is decided in your favor, we will credit this amount
          back and let you know.
        </Text>
      )}
    </>
  );
}

function Credited({ n, party, gift }: IBody) {
  return (
    <>
      <Text>
        On {n.credited_back_at}, we credited back{" "}
        <strong>{usd(n.credited_back_usd)}</strong> of what was owed on the{" "}
        {gift}.
      </Text>
      <Remaining n={n} party={party} />
    </>
  );
}

function Waived({ n, party, gift }: IBody) {
  return (
    <>
      <Text>
        On {n.written_off_at}, we waived{" "}
        <strong>{usd(n.written_off_usd)}</strong> that was still owed on the{" "}
        {gift}.
      </Text>
      <Remaining n={n} party={party} />
    </>
  );
}

function Remaining({ n, party }: Omit<IBody, "gift">) {
  if (settled(n.outstanding_usd)) {
    return (
      <Text>
        Nothing more is owed on this gift, and nothing more will be deducted.
      </Text>
    );
  }
  if (n.outstanding_usd < 0) {
    return (
      <Text>
        We had already deducted more than is now owed, so{" "}
        <strong>{usd(-n.outstanding_usd)}</strong> will be paid back to you with{" "}
        {party.repaid_with}.
      </Text>
    );
  }
  return (
    <Text>
      <strong>{usd(n.outstanding_usd)}</strong> is still owed and will be
      deducted from {party.recovered_from}.
    </Text>
  );
}
