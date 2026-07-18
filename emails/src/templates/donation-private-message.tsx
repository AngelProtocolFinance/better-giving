import { Hr, Text } from "react-email";
import { MailTo } from "../components/mail-to";
import { PublicLayout } from "../components/public-layout";
import { APP_NAME, EMAILS } from "../constants";
import { format_amount } from "../helpers";
import type { IDonation, IDonor } from "../types";

export interface IData extends IDonation {
  from: IDonor;
  message: string;
}

function Jsx(d: IData) {
  return (
    <PublicLayout type="donation">
      <Text>
        {d.from.full_name} has sent {d.to_name} a private message thru{" "}
        {format_amount(d.amount)} donation via {APP_NAME}.
      </Text>

      <Text style={{ fontSize: 12, color: "gray", marginTop: 10 }}>
        Transaction ID: {d.id} • {d.date}
      </Text>

      <Hr />

      <h2 style={{ fontSize: 14, marginBottom: 0 }}>
        Message from {d.from.first_name}
      </h2>
      <Text
        style={{
          marginTop: 4,
          padding: "12px",
          backgroundColor: "#f5f5f5",
          borderLeft: "3px solid #067df7",
          fontStyle: "italic",
        }}
      >
        {d.message}
      </Text>

      <Hr />

      <Text
        style={{
          marginTop: 10,
          fontSize: 12,
          color: "gray",
          lineHeight: 1.4,
        }}
      >
        This message was sent to you through {APP_NAME}. If you have any
        questions or concerns, please email <MailTo email={EMAILS.support} />
      </Text>
    </PublicLayout>
  );
}

export const template = (data: IData) => {
  return {
    node: <Jsx {...data} />,
    subject: `Private message from ${data.from.full_name} with ${format_amount(data.amount)} donation`,
  };
};
