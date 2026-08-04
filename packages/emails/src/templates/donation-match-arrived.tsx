import { Hr, Link, Text } from "react-email";
import { KeyValue } from "../components/key-value";
import { PublicLayout } from "../components/public-layout";
import { APP_NAME, DAPP_URL, EMAILS } from "../constants";
import { format_amount } from "../helpers";
import type { IAmount, IDonor } from "../types";

/**
 * the end of the filing pack's story: money arrived quoting the donor's
 * donation, and this is the one mail that says so.
 *
 * everything here is something we watched happen — a payment landed, it was
 * recorded against this donation, it goes to the same nonprofit. nothing about
 * the employer's side of it is asserted, because nothing about it is held: no
 * ratio, no cap, no schedule, no confirmation that the payer is the employer
 * the donor named. the props give the body nowhere to put such a claim.
 *
 * no thanks are passed on to the employer either. we have no relationship with
 * them and no standing to speak for the donor, who is the one whose form set
 * this off.
 */
export interface IData {
  /** the donor's original gift — what the payment was recorded against */
  donation_id: string;
  from: IDonor;
  /** what actually landed, and the only figure this mail can state */
  amount: IAmount;
  /** the nonprofit the donation went to, and so the one the match follows */
  to_name: string;
  /** the donor's own input, echoed back — never a resolved employer */
  employer_name?: string;
}

function Jsx(d: IData) {
  return (
    <PublicLayout type="donation">
      <Text>Hi {d.from.first_name},</Text>
      {/* "arrived quoting your donation" rather than "your employer sent" — the
          reference on the payment is the whole link between the two, and it is
          an admin reading a check, not a confirmation from anyone's payroll */}
      <Text>
        A matching gift arrived for your donation to{" "}
        <strong>{d.to_name}</strong>. It came in quoting your donation, so we've
        recorded <strong>{format_amount(d.amount)}</strong> against it — and it
        goes to {d.to_name}, the same nonprofit your own gift went to.
      </Text>
      {d.employer_name && (
        <Text>
          You told us you work at {d.employer_name} when you donated, which is
          why we went looking for this. We can't confirm who sent the payment,
          only that it named your donation.
        </Text>
      )}
      <Text>
        That's everything we know about it. We hold nothing about your
        employer's matching program — not what they match, not what they cap it
        at, not when they pay — so we can't tell you whether anything further is
        coming or whether this closes your claim. Your workplace giving team is
        the only source for that.
      </Text>

      <Hr />
      <h2 style={{ fontSize: 16, marginTop: 20 }}>What arrived</h2>
      <KeyValue label="Amount" value={format_amount(d.amount)} />
      <KeyValue label="Goes to" value={d.to_name} />
      {d.employer_name && (
        <KeyValue label="Employer (as you told us)" value={d.employer_name} />
      )}
      <KeyValue
        label="Your donation"
        value={
          <Link href={`${DAPP_URL}/donations/${d.donation_id}`}>
            view your donation
          </Link>
        }
      />

      {/* the matching gift is the employer's money, not the donor's, so it
          earns them no deduction and no receipt — said here because a donor who
          waits for one would wait forever */}
      <Text
        style={{ marginTop: 10, fontSize: 12, color: "gray", lineHeight: 1.4 }}
      >
        This is your employer's gift, not yours, so there's no receipt for you
        here — your own donation's receipt is unchanged. Anything looks wrong?
        Reply, or write to {EMAILS.hi}.
      </Text>

      <Text style={{ margin: 0, marginTop: 20 }}>Warm regards,</Text>
      <Text
        style={{
          margin: 0,
          marginBottom: 20,
          fontWeight: 600,
          color: "#3FA9F5",
        }}
      >
        The {APP_NAME} Team
      </Text>
    </PublicLayout>
  );
}

export const template = (data: IData) => ({
  node: <Jsx {...data} />,
  // names what was observed — a gift arrived — not a program having paid out
  subject: "A matching gift arrived for your donation",
});
