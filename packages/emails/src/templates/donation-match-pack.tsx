import { ADDRESS, EIN, LEGAL_NAME } from "@better-giving/brand";
import { flat_colors } from "@better-giving/brand/flat";
import { Text } from "react-email";
import { Hr } from "../components/hr";
import { KeyValue } from "../components/key-value";
import { Link } from "../components/link";
import { PublicLayout } from "../components/public-layout";
import { APP_NAME, DAPP_URL, EMAILS } from "../constants";
import { format_amount } from "../helpers";
import type { IDonation, IDonor } from "../types";

/**
 * the full-detail companion to the one-paragraph nudge in the donation receipt.
 *
 * the receipt points at the donation page; this prints the payload itself, for
 * a donor who named an employer and so is likely to actually file.
 *
 * there is no employer field beyond the name the donor typed. we hold no data
 * about any employer's matching program — no ratio, no cap, no deadline, no
 * portal — so the props give the body nowhere to put such a claim, and every
 * employer sentence below stays conditional by construction.
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
        When you donated, you told us you work at{" "}
        <strong>{d.employer_name}</strong>. Many employers will match a gift
        their employee has already made — but only once the employee files a
        short form for it. If {d.employer_name} runs a program like that,
        everything the form asks about the charity and the donation is below.
      </Text>
      <Text>
        We don't hold anything about {d.employer_name}'s side of it — whether
        they run a program, what they'd match, or when they'd need it by. Your
        employer is the only source for that, and it's the kind of detail that
        changes year to year, so anything we copied in here would be out of date
        by the time you read it.
      </Text>
      <Text>
        Search your intranet or benefits portal for "matching gifts" or
        "workplace giving" — that's usually where the form lives, and what it
        says there is current. If you can't find it, ask your HR or workplace
        giving team whether {d.employer_name} matches employee donations to
        charity.
      </Text>

      <Hr />
      <h2 style={{ fontSize: 16, marginTop: 20 }}>What the form asks for</h2>
      {/* legal name / ein / address come from the brand package, the same
          constants the receipt and the donation page read — a matching-gift
          form is checked against IRS records, so these three must not be able
          to disagree across the surfaces that print them */}
      <KeyValue label="Organization legal name" value={LEGAL_NAME} />
      <KeyValue label="EIN" value={EIN} />
      <KeyValue label="Organization address" value={ADDRESS} />
      <KeyValue label="Grant beneficiary" value={d.to_name} />
      <KeyValue label="Donation date" value={d.date} />
      <KeyValue label="Donation amount" value={format_amount(d.amount)} />
      <KeyValue label="Transaction ID" value={d.id} />
      <KeyValue
        label="Receipt"
        value={
          <Link href={`${DAPP_URL}/donations/${d.id}`}>view your donation</Link>
        }
      />
      {/* the beneficiary is named alongside us on purpose: a donor who thinks
          of the gift as going to the nonprofit will read a form full of Better
          Giving's details as wrong and stop */}
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
        form asks which charity you gave to, use {APP_NAME}'s details above —
        that's the record an employer verifies against. A match{" "}
        {d.employer_name} sends reaches {d.to_name} the same way, through us.
      </Text>

      <Hr />
      {/* remittance, kept apart from the form fields above: those map 1:1 to
          what an employer's form asks, and an employer who pays us directly
          asks something else entirely. check and mail only — no bank details,
          which have no business in an inbox or on the public donation page. */}
      <h2 style={{ fontSize: 16, marginTop: 20 }}>
        If your employer sends the match directly
      </h2>
      <Text>
        Most employers pay through their giving platform, which already holds
        our details. If yours mails a check instead, this is what they need.
      </Text>
      <KeyValue label="Make checks payable to" value={LEGAL_NAME} />
      <KeyValue label="Mail to" value={ADDRESS} />
      {/* the only thing tying an arriving payment back to the gift it matches —
          an employer's check names the employer, never the donor */}
      <KeyValue label="Reference" value={`Donation ${d.id}`} />
      <KeyValue label="Employer questions" value={EMAILS.hi} />

      <Hr />
      {/* the donor is the only one who can tell us a claim was filed —
          employers verify with the charity, they don't report back to us */}
      <Text style={{ marginTop: 20 }}>
        Once you've filed it,{" "}
        <Link href={`${DAPP_URL}/donations/${d.id}`}>
          let us know on your donation page
        </Link>
        . Then we'll know to expect your employer's verification request and can
        answer it quickly.
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
  // names the artifact, not the outcome — the employer may run no program at all
  subject: "Your donation details for a matching-gift form",
});
