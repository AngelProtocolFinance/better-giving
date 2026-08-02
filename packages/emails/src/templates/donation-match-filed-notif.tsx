import { Hr, Link, Text } from "react-email";
import { KeyValue } from "../components/key-value";
import { PlatformLayout } from "../components/platform-layout";
import { DAPP_URL } from "../constants";
import { format_amount } from "../helpers";
import type { IDonation, IDonor } from "../types";

/**
 * internal heads-up: a donor says they filed a matching-gift claim.
 *
 * goes to us, never to the beneficiary nonprofit. Better Giving is the 501(c)(3)
 * on the donor's receipt, so an employer verifying the gift writes to us — the
 * nonprofit could not answer them and has nothing to do with the claim.
 *
 * self-reported and unverified by construction: employers verify with the
 * charity, they don't report back, so the donor is the only source. that is why
 * the body promises nothing about the employer's side and only says what to
 * expect on ours.
 */
export interface IData extends IDonation {
  from: IDonor;
  /** where the donor is reachable if the verification needs matching up */
  from_email: string;
  /** the donor's own input, echoed back — never treated as a known employer */
  employer_name?: string;
}

function Jsx(d: IData) {
  const employer = d.employer_name || "not given";
  return (
    <PlatformLayout>
      <Text>
        {d.from.full_name} says they filed a matching-gift claim for this
        donation. Expect a verification request from{" "}
        {/* the button is on the universal panel, so a donor who never named an
            employer can file — the prose has to read without a name */}
        {d.employer_name || "their employer"} and answer it — we're the charity
        of record on the receipt, so it comes to us.
      </Text>

      <Hr />

      <KeyValue label="donation id" value={d.id} />
      <KeyValue label="donor" value={d.from.full_name} />
      <KeyValue label="donor email" value={d.from_email} />
      {/* the donor's typed employer, unresolved — the claim is filed with them,
          but we hold nothing about whether they run a program at all */}
      <KeyValue label="employer (donor-entered)" value={employer} />
      <KeyValue label="beneficiary" value={d.to_name} />
      <KeyValue label="donation date" value={d.date} />
      <KeyValue label="amount" value={format_amount(d.amount)} />
      <KeyValue
        label="donation page"
        value={
          <Link href={`${DAPP_URL}/donations/${d.id}`}>
            {`${DAPP_URL}/donations/${d.id}`}
          </Link>
        }
      />
    </PlatformLayout>
  );
}

export const template = (data: IData) => ({
  node: <Jsx {...data} />,
  // names what happened, not an outcome — nothing here confirms a match will
  // ever be paid
  subject: `Match claim filed: ${data.employer_name || "employer not given"}`,
});
