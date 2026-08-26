import { ADDRESS, EIN, LEGAL_NAME } from "@better-giving/brand";
import { flat_colors } from "@better-giving/brand/flat";
import { Text } from "react-email";
import { Hr } from "../components/hr";
import { KeyValue } from "../components/key-value";
import { Link } from "../components/link";
import { PublicLayout } from "../components/public-layout";
import { APP_NAME, DAPP_URL } from "../constants";
import { format_amount } from "../helpers";
import type { IDonation, IDonor } from "../types";

/**
 * the one reminder to the donor who got the filing pack and never came back.
 *
 * deliberately shorter than the pack: everything a donor needs to act is on the
 * donation page, so this reprints only what a form asks for and cannot be got
 * wrong from memory — who received the gift, and when, and how much.
 *
 * the same rule as the pack, for the same reason: no prop here can carry a claim
 * about the employer's program, because we hold no such data. every employer
 * sentence stays conditional, and there is no deadline to be late for.
 */
export interface IData extends IDonation {
  from: IDonor;
  /** the donor's own input, echoed back — never treated as a known employer */
  employer_name: string;
}

function Jsx(d: IData) {
  return (
    <PublicLayout type="donation">
      <Text>Hi {d.from.first_name},</Text>
      <Text>
        A few days ago we sent you the details to file a matching-gift claim
        with {d.employer_name}. If you've already filed it, thank you — nothing
        more is needed from you, and you can ignore this.
      </Text>
      <Text>
        If you haven't, here are those details again so you don't have to go
        looking for that email. We still don't hold anything about{" "}
        {d.employer_name}'s side of it — whether they run a program, what they'd
        match, or when they'd need it by. Your HR or workplace giving team is
        the only source for that.
      </Text>

      <Hr />
      {/* reprinted rather than linked: these three are checked against IRS
          records, and a claim is rejected when two emails from us disagree
          about who received the gift */}
      <KeyValue label="Organization legal name" value={LEGAL_NAME} />
      <KeyValue label="EIN" value={EIN} />
      <KeyValue label="Organization address" value={ADDRESS} />
      <KeyValue label="Donation date" value={d.date} />
      <KeyValue label="Donation amount" value={format_amount(d.amount)} />
      <Text
        style={{
          marginTop: 10,
          fontSize: 12,
          color: flat_colors.gray_11,
          lineHeight: 1.4,
        }}
      >
        {LEGAL_NAME} ({APP_NAME}) is the US 501(c)(3) that received your gift
        and issued your receipt, then grants it on to {d.to_name}. Wherever the
        form asks which charity you gave to, use {APP_NAME}'s details above — a
        match {d.employer_name} sends reaches {d.to_name} the same way, through
        us.
      </Text>

      <Hr />
      <Text style={{ marginTop: 20 }}>
        <Link href={`${DAPP_URL}/donations/${d.id}`}>
          Your donation page has the rest
        </Link>{" "}
        — the transaction ID, your receipt, and the button to tell us once
        you've filed. That last one is the only way we hear about it, and it's
        what lets us answer your employer's verification request quickly.
      </Text>

      <Text style={{ margin: 0, marginTop: 20 }}>Warm regards,</Text>
      <Text
        style={{
          margin: 0,
          marginBottom: 20,
          fontWeight: 600,
          color: flat_colors.primary,
        }}
      >
        The {APP_NAME} Team
      </Text>
    </PublicLayout>
  );
}

export const template = (data: IData) => ({
  node: <Jsx {...data} />,
  // marked a reminder and nothing more — there is no deadline here to be late
  // for, and we do not know that the employer matches at all
  subject: "A reminder: your matching-gift details",
});
