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
        You requested a new verification code for your {APP_NAME} account.
        Please use the code below:
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
      <Text>This code will expire in 24 hours.</Text>
      <Text>If you didn't request this code, you can ignore this email.</Text>
    </PublicLayout>
  );
}

export const template = (data: IData) => {
  return {
    node: <Jsx {...data} />,
    subject: `Your new ${APP_NAME} verification code`,
  };
};
