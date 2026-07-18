import { Link, Text } from "react-email";
import { MailTo } from "../components/mail-to";
import { PublicLayout } from "../components/public-layout";
import { APP_NAME, DAPP_URL, EMAILS } from "../constants";

export interface IData {
  from_name: string;
  to_name: string;
  verification_link: string;
}

function Jsx({ from_name, to_name, verification_link }: IData) {
  return (
    <PublicLayout type="donation">
      <Text>Hi {from_name},</Text>
      <Text>
        Thank you for your generous donation to {to_name}. To complete the
        process, we need you to verify your bank account through a secure
        micro-deposit method.
      </Text>
      <Text>
        Our secure payment processor, Stripe, has initiated two small
        verification deposits (under $1 each) to your bank account. These
        deposits will appear within 1-2 business days. You can then enter their
        exact amounts to confirm your account ownership.
      </Text>

      <Text>
        Please complete this verification within 7 days to ensure your donation
        is processed successfully. When you see the deposits in your account:
      </Text>

      <Link
        href={verification_link}
        style={{ marginTop: 10, marginBottom: 10, display: "block" }}
      >
        <strong>Verify your bank account with Better Giving</strong>
      </Link>

      <Text>
        This verification link is also available in your donation record on your{" "}
        <Link href={`${DAPP_URL}/dashboard/donations`}>My donations</Link> page.
        If you encounter any issues, please contact our support team at{" "}
        <MailTo email={EMAILS.support} /> for assistance.
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
    </PublicLayout>
  );
}

export const template = (data: IData) => {
  return {
    node: <Jsx {...data} />,
    subject: `Complete your donation to ${data.to_name} - Bank verification needed`,
  };
};
