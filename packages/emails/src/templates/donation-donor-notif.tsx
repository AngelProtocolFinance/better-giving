import { Link, Text } from "react-email";
import { PublicLayout } from "../components/public-layout";
import { APP_NAME, DAPP_URL } from "../constants";

export interface IData {
  donor_first_name: string;
  nonprofit_name: string;
  transaction_id: string;
  program_name?: string;
  is_guest?: boolean;
  is_recurring?: boolean;
}

function Jsx({
  donor_first_name,
  transaction_id,
  nonprofit_name,
  is_guest,
  is_recurring,
  program_name,
}: IData) {
  return (
    <PublicLayout>
      <Text>Hi {donor_first_name},</Text>

      <Text style={{ marginBottom: 0 }}>
        Thank you for your {is_recurring && "recurring "}donation to{" "}
        {nonprofit_name}
        {program_name && `'s program: ${program_name}`} through Better Giving!
      </Text>
      <Text style={{ marginTop: 0 }}>
        Your donation's Reference ID is: <strong>{transaction_id}</strong>
      </Text>

      <Text>
        If you would like to receive a tax receipt, you can provide some
        additional information through your Better Giving account.
      </Text>

      <Text style={{ marginTop: 4 }}>
        {is_guest && (
          <>
            To get started,{" "}
            <Link href={`${DAPP_URL}/signup`}>create a {APP_NAME} account</Link>{" "}
            using this email address.{" "}
          </>
        )}
        Then visit your{" "}
        <Link href={`${DAPP_URL}/dashboard/donations`}>My Donations page</Link>{" "}
        to find your donation using the Reference ID above. From there, you can
        request a tax receipt by providing your donor information.
      </Text>

      <Text>Thank you again for your generosity!</Text>
    </PublicLayout>
  );
}

export const template = (data: IData) => {
  return {
    node: <Jsx {...data} />,
    subject: "Thank you for donating",
  };
};
