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
        We received a request to reset your {APP_NAME} password. Use the
        verification code below to complete the process:
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
      <Text>This code will expire in 1 hour.</Text>
      <Text>
        If you didn't request a password reset, you can safely ignore this
        email. Your password will remain unchanged.
      </Text>
    </PublicLayout>
  );
}

export const template = (data: IData) => {
  return {
    node: <Jsx {...data} />,
    subject: `Reset your ${APP_NAME} password`,
  };
};
