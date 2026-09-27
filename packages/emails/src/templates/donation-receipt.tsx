import { ADDRESS, EIN, LEGAL_NAME } from "@better-giving/brand";
import { flat_colors } from "@better-giving/brand/flat";
import { Fragment } from "react";
import { Text } from "react-email";
import { Hr } from "../components/hr";
import { KeyValue } from "../components/key-value";
import { Link } from "../components/link";
import { PublicLayout } from "../components/public-layout";
import { APP_NAME, DAPP_URL, HELP } from "../constants";
import { format_amount } from "../helpers";
import type { IAmount, IDonation, IDonor } from "../types";

export interface IReceiptLine {
  name: string;
  amount: IAmount;
  /**
   * `tip`: the donor's tip to Better Giving.
   * `fee`: the processing fee the donor chose to cover; labelled
   * "Covered processing fee", its `name` ignored
   */
  kind: "beneficiary" | "tip" | "fee";
  /** this nonprofit's receipt message to the donor */
  msg?: string;
  /** the beneficiary's program the gift is for */
  program?: string;
}

export interface IData extends Omit<IDonation, "program_name"> {
  is_recurring?: boolean;
  /** is donation to Better Giving directly (vs through NPO) */
  is_bg?: boolean;
  /** is donation to a fund, which Better Giving grants among its members */
  is_fund?: boolean;
  from: IDonor;
  /** tax receipt ID - if provided, shows as tax receipt */
  tax_receipt_id?: string;
  /** every part of the gift under this one receipt; `amount` is their total */
  lines: IReceiptLine[];
}

const line_label = (l: IReceiptLine) => {
  if (l.kind === "tip") return `${l.name} (tip)`;
  if (l.kind === "fee") return "Covered processing fee";
  return l.name;
};

const subheading_style = { fontSize: 14, marginBottom: 0 };

function Jsx(d: IData) {
  const beneficiaries = d.lines.filter((l) => l.kind === "beneficiary");
  // tip before fee coverage, whatever order the lines arrive in
  const extras = [
    ...d.lines.filter((l) => l.kind === "tip"),
    ...d.lines.filter((l) => l.kind === "fee"),
  ];
  // a gift to Better Giving itself is kept, not granted on
  const n_grants = d.is_bg ? 0 : beneficiaries.length;
  return (
    <PublicLayout type="donation">
      <Text>Hi {d.from.first_name}</Text>
      <Text>
        We want to express our deepest gratitude for your generous{" "}
        {d.is_recurring && "recurring "}donation
        {d.is_bg ? "." : ` via ${APP_NAME} to ${d.to_name}.`} Your support for{" "}
        {d.is_bg ? APP_NAME : "them"} plays a pivotal role in driving positive
        change within our global community.
      </Text>
      <Text>
        {d.tax_receipt_id && (
          <>
            Below, you'll find your official tax receipt, which you can use for
            your records when tax season rolls around.{" "}
          </>
        )}
        Don't forget,{" "}
        <Link href={HELP.personal_account_signin}>you can sign in</Link> to keep
        track of all your donations
        {d.tax_receipt_id && " and download further receipts"}, if you have
        created your free {APP_NAME} personal account.
      </Text>
      <Text>
        If you know of any other nonprofits that could benefit from our Better
        Giving services, just direct them to our{" "}
        <Link href={`${DAPP_URL}/register`}>registration page</Link> so they can
        sign up and start to collect donations.
      </Text>
      <Text>
        Many employers match their employees' charitable donations, but the
        match only happens if the employee files a short form with them. If
        yours has a matching program, everything that form asks for — our legal
        name, EIN and address, and this donation's details — is on your{" "}
        <Link href={`${DAPP_URL}/donations/${d.id}`}>donation page</Link>.
      </Text>
      <Text>
        Thank you once again for your incredible support. We look forward to
        continuing this journey of giving with you.
      </Text>
      <Text style={{ margin: 0 }}>Warm regards,</Text>
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

      {d.lines.map(
        (l, i) =>
          l.msg && (
            <Fragment key={`${l.kind}-${i}`}>
              <Hr />
              <h2 style={{ fontSize: 14, marginBottom: 0 }}>
                A message from {l.name}
              </h2>
              <Text style={{ marginTop: 4 }}>{l.msg}</Text>
            </Fragment>
          )
      )}

      <Hr />
      <h2 style={{ fontSize: 16, marginTop: 20 }}>
        {d.tax_receipt_id ? "Your Tax Receipt" : "Your donation summary"}
      </h2>
      <KeyValue label="Non-profit Organization" value={APP_NAME} />
      <KeyValue label="Full name" value={d.from.full_name} />
      {d.from.address && <KeyValue label="Address" value={d.from.address} />}
      <KeyValue label="Item" value="Online donation" />
      {n_grants > 0 && (
        <h3 style={subheading_style}>
          {d.is_fund
            ? "Fund"
            : n_grants === 1
              ? "Grant Beneficiary"
              : "Grant Beneficiaries"}
        </h3>
      )}
      {beneficiaries.map((l, i) => (
        <Fragment key={`${l.kind}-${i}`}>
          <KeyValue label={line_label(l)} value={format_amount(l.amount)} />
          {l.program && (
            <Text
              style={{
                margin: "2px 0",
                fontSize: 12,
                color: flat_colors.gray_11,
              }}
            >
              Program: {l.program}
            </Text>
          )}
        </Fragment>
      ))}
      <Hr />
      {/* a sibling of the beneficiaries heading, so the rows below leave its outline scope */}
      <h3 style={subheading_style}>Payment</h3>
      {extras.map((l, i) => (
        <KeyValue
          key={`${l.kind}-${i}`}
          label={line_label(l)}
          value={format_amount(l.amount)}
        />
      ))}
      {extras.length > 0 && <Hr />}
      <KeyValue label="Total" value={format_amount(d.amount)} />
      {d.tax_receipt_id && (
        <KeyValue label="Receipt ID" value={d.tax_receipt_id} />
      )}
      <KeyValue label="Transaction ID" value={d.id} />
      <KeyValue label="Transaction date" value={d.date} />

      <Text
        style={{
          marginTop: 10,
          fontSize: 12,
          color: flat_colors.gray_11,
          lineHeight: 1.4,
        }}
      >
        {LEGAL_NAME} ({APP_NAME}) is a US 501(c)(3) tax-exempt nonprofit with
        EIN {EIN}, {ADDRESS}. No goods or services are provided to you in
        exchange for your gift, so the full amount you paid qualifies as a
        charitable contribution for US tax purposes.
        {n_grants > 0 &&
          (d.is_fund
            ? ` ${APP_NAME} then grants the donation among the fund's member nonprofits on your behalf.`
            : ` ${APP_NAME} then grants the donation to the ${n_grants === 1 ? "chosen nonprofit" : "nonprofits listed above"} on your behalf.`)}
      </Text>
    </PublicLayout>
  );
}

export const template = (data: IData) => {
  return {
    node: <Jsx {...data} />,
    subject: `${data.tax_receipt_id ? "Tax receipt: " : ""}Thank you for donating`,
  };
};
