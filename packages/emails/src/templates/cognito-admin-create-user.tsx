import { Text } from "react-email";
import { PublicLayout } from "../components/public-layout";
import { APP_NAME } from "../constants";

export interface IData {
  code: string;
  first_name?: string;
}

function Jsx({ code, first_name }: IData) {
  return (
    <PublicLayout>
      <Text>{first_name ? `Hi ${first_name},` : "Hello,"}</Text>
      <Text>
        You've been invited to {APP_NAME}. Use the temporary password below to
        sign in:
      </Text>
      <Text
        style={{
          textAlign: "center",
          fontFamily: "monospace",
          fontWeight: 600,
          fontSize: 32,
          letterSpacing: 8,
          margin: "24px 0",
        }}
      >
        {code}
      </Text>
      <Text>You'll be prompted to set a new password on first sign-in.</Text>
      <Text>
        If you weren't expecting this invitation, you can ignore this email.
      </Text>
    </PublicLayout>
  );
}

export const template = (data: IData) => {
  return {
    node: <Jsx {...data} />,
    subject: `You've been invited to ${APP_NAME}`,
  };
};
