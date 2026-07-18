import { Text } from "react-email";
import { MailTo } from "../components/mail-to";
import { PublicLayout } from "../components/public-layout";
import { APP_NAME, EMAILS } from "../constants";

export interface IData {
  donor_first_name: string;
  recipient_name: string;
  error_message: string;
}

function Jsx({ donor_first_name, recipient_name, error_message }: IData) {
  return (
    <PublicLayout type="donation">
      <Text>Hi {donor_first_name},</Text>
      <Text>We were unable to process your donation to {recipient_name}.</Text>
      <Text style={{ background: "#FFF0F0", padding: "20px", color: "red" }}>
        {error_message}
      </Text>
      <Text>
        We appreciate your intention to support our cause and would like to
        connect to resolve this issue. Please reach out to us via{" "}
        <MailTo email={EMAILS.hi} />.
      </Text>
      <Text>Thank you for your understanding and generosity.</Text>
      <Text style={{ margin: 0 }}>Sincerely,</Text>
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

export const template = (data: IData) => {
  return {
    node: <Jsx {...data} />,
    subject: `Donation for ${data.recipient_name} failed`,
  };
};
