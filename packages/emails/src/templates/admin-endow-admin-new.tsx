import { Link, Text } from "react-email";
import { PublicLayout } from "../components/public-layout";
import { APP_NAME, DAPP_URL } from "../constants";

export interface IData {
  first_name: string;
  endow_name: string;
  invitor: string;
}

function Jsx({ first_name, invitor, endow_name }: IData) {
  return (
    <PublicLayout>
      <Text>{first_name},</Text>
      <Text>
        You have been invited by {invitor} to become an administrator of{" "}
        <strong>{endow_name}</strong>'s {APP_NAME} account.
      </Text>
      <Text>
        <Link target="_blank" href={`${DAPP_URL}/login`}>
          Log in
        </Link>{" "}
        using your {APP_NAME} account password, or if you have not signed up
        before, create a new personal user account with this email address to
        access <strong>{endow_name}</strong> administration dashboard.
      </Text>
      <Text>
        Need help administering the account? Take a look at the{" "}
        <Link
          target="_blank"
          href="https://intercom.help/better-giving/en/collections/3700095-administering-my-better-giving-account"
        >
          help pages
        </Link>{" "}
        here.
      </Text>
    </PublicLayout>
  );
}

export const template = (data: IData) => {
  return {
    node: <Jsx {...data} />,
    subject: `${APP_NAME}: Administrator account invitation`,
  };
};
