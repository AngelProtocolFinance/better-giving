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
  /** 0 the first time the row owes; each later round is the row owing again
   * after it was settled */
  round: number;
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
  /** received, both fees and credited back are net of `refund_failed_usd`
   * and `dispute_won_usd`, so no total here adds either back in */
  received_usd: number;
  fee_processing_usd: number;
  fee_dispute_usd: number;
  /** credited back because the refund failed */
  refund_failed_usd: number;
  /** credited back when a dispute settled: won, its claim accepted, its
   * inquiry closed, or charged back for less than it claimed */
  dispute_won_usd: number;
  /** every other credit */
  credited_back_usd: number;
  /** pretty date of the latest credit, of any kind */
  credited_back_at?: string;
  /** net of any due-back already paid */
  recovered_usd: number;
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

/** the breakdown runs on to what is still owed once anything came off */
const part_settled = (n: IOwedNotice) =>
  n.credited_back_usd > 0 || n.written_off_usd > 0 || n.recovered_usd > 0;

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
      {n.refund_failed_usd > 0 && (
        <KeyValue
          label="Credited back when the refund failed"
          value={usd(n.refund_failed_usd)}
        />
      )}
      {n.dispute_won_usd > 0 && (
        <KeyValue
          label="Credited back when the dispute was settled"
          value={usd(n.dispute_won_usd)}
        />
      )}
      {/* a row credited in full this way owes nothing else: no zero lines */}
      {owed_total(n) > 0 && <Breakdown n={n} party={party} />}

      <Text>
        <Link href={n.history_url}>{party.history_label}</Link>
      </Text>
    </PublicLayout>
  );
}

function Breakdown({ n, party }: Omit<IBody, "gift">) {
  return (
    <>
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
      {part_settled(n) ? (
        <>
          <KeyValue label="Total" value={usd(owed_total(n))} />
          {n.credited_back_usd > 0 && (
            <KeyValue
              label="Credited back"
              value={`-${usd(n.credited_back_usd)}`}
            />
          )}
          {n.written_off_usd > 0 && (
            <KeyValue label="Waived" value={`-${usd(n.written_off_usd)}`} />
          )}
          {n.recovered_usd > 0 && (
            <KeyValue
              label="Already deducted"
              value={`-${usd(n.recovered_usd)}`}
            />
          )}
          <KeyValue
            label={n.outstanding_usd < 0 ? "Due to you" : "Still owed"}
            value={usd(Math.abs(n.outstanding_usd))}
          />
        </>
      ) : (
        <KeyValue label="Total owed" value={usd(owed_total(n))} />
      )}
    </>
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
      {n.round > 0 ? (
        // the row's date and source are its first event's, not the one that
        // made it owe again, so neither is named here
        <Text>
          <strong>{usd(n.outstanding_usd)}</strong> is owed again on the {gift}.
          What was settled on it before no longer covers what it owes now.
        </Text>
      ) : (
        <Text>
          {n.source === "refund"
            ? `On ${n.recorded_at}, the ${gift} was refunded to the donor.`
            : `On ${n.recorded_at}, the donor's bank opened a dispute on the ${gift}.`}{" "}
          {party.already_paid}, so <strong>{usd(owed_total(n))}</strong> is now
          owed back.
        </Text>
      )}
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

// each credit and the write-off figure is a total over its entries and the
// row keeps only the latest date of each, so no sentence dates a total; the
// latest date is said as the latest

function Credited({ n, party, gift }: IBody) {
  return (
    <>
      {n.refund_failed_usd > 0 && (
        <Text>
          The refund of the {gift} failed, so the gift stands and we credited
          back <strong>{usd(n.refund_failed_usd)}</strong> of what was owed on
          it.
        </Text>
      )}
      {/* a won dispute, an accepted claim, a closed inquiry or a smaller
          chargeback all credit here, so the sentence claims no outcome */}
      {n.dispute_won_usd > 0 && (
        <Text>
          We credited back <strong>{usd(n.dispute_won_usd)}</strong> of what was
          owed on the {gift}, because its dispute was settled.
        </Text>
      )}
      {n.credited_back_usd > 0 && (
        <Text>
          We credited back <strong>{usd(n.credited_back_usd)}</strong> of what
          was owed on the {gift}.
        </Text>
      )}
      <Text>The most recent credit was on {n.credited_back_at}.</Text>
      <Remaining n={n} party={party} />
    </>
  );
}

function Waived({ n, party, gift }: IBody) {
  return (
    <>
      <Text>
        We have waived <strong>{usd(n.written_off_usd)}</strong> in total of
        what was owed on the {gift}, most recently on {n.written_off_at}.
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
