import { LEGAL_NAME } from "@better-giving/brand";
import { flat_colors } from "@better-giving/brand/flat";
import { Text } from "react-email";
import { Hr } from "../components/hr";
import { KeyValue } from "../components/key-value";
import { Link } from "../components/link";
import { PlatformLayout } from "../components/platform-layout";
import { APP_NAME, DAPP_URL } from "../constants";
import { format_amount, format_gap } from "../helpers";
import type { IAmount } from "../types";

/**
 * a donation was refunded after the donor had already filed a matching-gift
 * claim against it.
 *
 * internal — the counterpart to `donation-match-filed-notif`, and internal for
 * the same reason: the claim names {@link LEGAL_NAME}, so the employer's
 * verification request and any match payment land here, not at the nonprofit.
 * the beneficiary has nothing to answer and would only be reading a reversal of
 * revenue it was never told to expect.
 *
 * the donor is not written to either. they asked for their own money back,
 * which is theirs to ask for; the outstanding claim is ours to close.
 */
export interface IData {
  /** where the grant would have landed — the nonprofit or fund donated to */
  to_name: string;
  donor_name: string;
  donor_email: string;
  /** the donor's own input, echoed back — never a resolved employer */
  employer_name: string;
  donation: { id: string; amount: IAmount };
  /** iso — when the donor told us they filed the claim */
  filed_at: string;
  /** iso — when the refund voided the event */
  refunded_at: string;
  /** whether the reversal was recovered in full */
  void_reason: "refunded" | "refunded_loss";
}

function Jsx(d: IData) {
  const gap = format_gap(d.filed_at, d.refunded_at);
  const lost = d.void_reason === "refunded_loss";

  return (
    <PlatformLayout>
      <Text>
        {d.donor_name}'s {format_amount(d.donation.amount)} donation to{" "}
        {d.to_name} has been refunded. They had told us they filed a
        matching-gift claim for it with <strong>{d.employer_name}</strong> {gap}{" "}
        before the refund.
      </Text>

      <h2 style={{ fontSize: 16, marginTop: 20 }}>Why this needs a look</h2>
      <Text>
        The claim was filed under {LEGAL_NAME}, so it may still be open with{" "}
        {d.employer_name} against a donation that no longer exists. If they
        approve it, they pay {APP_NAME} for a gift that has already gone back to
        the donor — and {APP_NAME} is who they would reclaim it from once they
        find out.
      </Text>
      <Text>
        When {d.employer_name} — or a platform like Benevity, YourCause or
        Bright Funds acting for them — writes to verify this donation,{" "}
        <strong>tell them it was refunded</strong> so the claim is withdrawn
        before it pays. If the verification has already been answered, it is
        worth reaching out rather than waiting.
      </Text>
      {lost && (
        <Text>
          This refund settled with a loss: the grant had already moved beyond
          what could be pulled back, so {APP_NAME} covered the difference.
        </Text>
      )}

      <Hr />
      <h2 style={{ fontSize: 16, marginTop: 20 }}>The donation</h2>
      <KeyValue label="Donor" value={d.donor_name} />
      <KeyValue label="Donor email" value={d.donor_email} />
      <KeyValue label="Employer (donor-entered)" value={d.employer_name} />
      <KeyValue label="Grant recipient" value={d.to_name} />
      <KeyValue label="Amount" value={format_amount(d.donation.amount)} />
      <KeyValue
        label="Refund"
        value={lost ? "Settled with a loss" : "Recovered in full"}
      />
      <KeyValue label="Claim filed" value={`${gap} before the refund`} />
      <KeyValue
        label="Transaction ID"
        value={
          <Link href={`${DAPP_URL}/donations/${d.donation.id}`}>
            {d.donation.id}
          </Link>
        }
      />

      {/* the donor said they filed; nothing confirmed it, and we hold nothing
          about whether the employer runs a program at all. the claim may never
          have existed — which is a reason to ask, not to assume either way */}
      <Text
        style={{
          marginTop: 10,
          fontSize: 12,
          color: flat_colors.gray_11,
          lineHeight: 1.4,
        }}
      >
        Filing is self-reported: the donor pressed "I filed this" on their
        donation page. Nothing here confirms {d.employer_name} received a claim,
        runs a matching program, or intends to pay one.
      </Text>
    </PlatformLayout>
  );
}

export const template = (data: IData) => ({
  node: <Jsx {...data} />,
  // names the donation, so a reply thread stays findable against the row
  subject: `Refunded after a match claim was filed: ${data.donation.id}`,
});
