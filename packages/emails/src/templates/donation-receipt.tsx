import { Hr, Link, Text } from "react-email";
import { KeyValue } from "../components/key-value";
import { PublicLayout } from "../components/public-layout";
import { APP_NAME, DAPP_URL } from "../constants";
import { format_amount } from "../helpers";
import type { IDonation, IDonor } from "../types";

export interface IData extends IDonation {
  is_recurring?: boolean;
  /** is donation to Better Giving directly (vs through NPO) */
  is_bg?: boolean;
  from: IDonor;
  /** tax receipt ID - if provided, shows as tax receipt */
  tax_receipt_id?: string;
  /** custom message from nonprofit */
  to_msg_to_from?: string;
}

function Jsx(d: IData) {
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
        <Link href="https://intercom.help/better-giving/en/articles/8791497-how-to-sign-in-to-a-better-giving-personal-account">
          you can sign in
        </Link>{" "}
        to keep track of all your donations
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
        Thank you once again for your incredible support. We look forward to
        continuing this journey of giving with you.
      </Text>
      <Text style={{ margin: 0 }}>Warm regards,</Text>
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

      {d.to_msg_to_from && (
        <>
          <Hr />
          <h2 style={{ fontSize: 14, marginBottom: 0 }}>
            A message from {d.to_name}
          </h2>
          <Text style={{ marginTop: 4 }}>{d.to_msg_to_from}</Text>
        </>
      )}

      <Hr />
      <h2 style={{ fontSize: 16, marginTop: 20 }}>
        {d.tax_receipt_id ? "Your Tax Receipt" : "Your donation summary"}
      </h2>
      <KeyValue label="Non-profit Organization" value={APP_NAME} />
      <KeyValue label="Grant Beneficiary" value={d.to_name} />
      {d.program_name && <KeyValue label="Program" value={d.program_name} />}
      <KeyValue label="Full name" value={d.from.full_name} />
      {d.from.address && <KeyValue label="Address" value={d.from.address} />}
      {d.tax_receipt_id && (
        <KeyValue label="Receipt ID" value={d.tax_receipt_id} />
      )}
      <KeyValue label="Transaction ID" value={d.id} />
      <KeyValue label="Transaction date" value={d.date} />
      <KeyValue label="Item" value="Online donation" />
      <KeyValue label="Quantity" value={format_amount(d.amount)} />

      <Text
        style={{
          marginTop: 10,
          fontSize: 12,
          color: "gray",
          lineHeight: 1.4,
        }}
      >
        {APP_NAME} is a US 501(c)(3) tax-exempt nonprofit with EIN 87-3758939.
        No goods or services are provided to you in exchange for your gift, so
        the full amount you paid qualifies as a charitable contribution for US
        tax purposes. {APP_NAME} then grants the donation to the chosen
        nonprofit on your behalf.
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
