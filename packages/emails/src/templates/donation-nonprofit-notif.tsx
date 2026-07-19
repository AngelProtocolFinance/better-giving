import { Hr, Link, Text } from "react-email";
import { KeyValue } from "../components/key-value";
import { MailTo } from "../components/mail-to";
import { PublicLayout } from "../components/public-layout";
import { DAPP_URL, EMAILS } from "../constants";
import { format_amount } from "../helpers";
import type { IDonation, IDonor } from "../types";

export interface IData extends IDonation {
  to_id: string;
  is_recurring?: boolean;
  from?: IDonor;
  claimed?: boolean;
  from_private_msg_to_to?: string;
}

function Jsx(d: IData) {
  return (
    <PublicLayout
      type="donation"
      bottom_content={
        <Text style={{ textAlign: "center", fontSize: 12, color: "gray" }}>
          Getting too many emails?{" "}
          <Link href={`${DAPP_URL}/dashboard/settings`}>
            Manage your preferences
          </Link>
        </Text>
      }
    >
      <Text>Hi,</Text>
      <Text>
        {d.to_name} has received a donation via Better Giving. You can also see
        a record of this donation in your Better Giving dashboard.
      </Text>
      <KeyValue label="Transaction ID" value={d.id} />
      <KeyValue label="Transaction date" value={d.date} />
      <KeyValue
        label="Item"
        value={d.is_recurring ? "Online recurring donation" : "Online donation"}
      />
      <KeyValue label="Quantity" value={format_amount(d.amount)} />
      {d.program_name && <KeyValue label="Program" value={d.program_name} />}

      {d.from && (
        <>
          <h2 style={{ fontSize: 16, marginTop: 20 }}>Donor details</h2>
          <KeyValue label="Full name" value={d.from.full_name} />
          {d.from.address && (
            <KeyValue label="Address" value={d.from.address} />
          )}
        </>
      )}

      {d.from_private_msg_to_to && (
        <>
          <Hr />
          <h2 style={{ fontSize: 14, marginBottom: 0 }}>
            A private message from {d.from?.first_name || "the donor"}
          </h2>
          <Text style={{ marginTop: 4 }}>{d.from_private_msg_to_to}</Text>
        </>
      )}

      <Text
        style={{
          marginTop: 10,
          fontSize: 12,
          color: "gray",
          lineHeight: 1.4,
        }}
      >
        For donor's tax purposes, no goods or services are provided in exchange
        for this donation. If you have any questions, please email{" "}
        <MailTo email={EMAILS.support} />
      </Text>
    </PublicLayout>
  );
}

export const template = (data: IData) => {
  return {
    node: <Jsx {...data} />,
    subject: data.claimed
      ? `Donation to ${data.to_name}`
      : `Donation to Unclaimed NPO: ${data.to_name}`,
  };
};
