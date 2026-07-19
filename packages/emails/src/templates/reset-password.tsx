import { Button, Text } from "react-email";
import { PublicLayout } from "../components/public-layout";
import { APP_NAME } from "../constants";

export interface IData {
  url: string;
  first_name?: string;
}

function Jsx({ url, first_name }: IData) {
  return (
    <PublicLayout>
      <Text>{first_name ? `Hi ${first_name},` : "Hello,"}</Text>
      <Text>
        We received a request to reset your {APP_NAME} password. Click the
        button below to set a new password:
      </Text>
      <Button
        href={url}
        style={{
          display: "block",
          width: "100%",
          textAlign: "center",
          backgroundColor: "#3FA9F5",
          color: "#fff",
          fontWeight: 600,
          fontSize: 16,
          padding: "14px 0",
          borderRadius: 6,
          margin: "24px 0",
        }}
      >
        Reset Password
      </Button>
      <Text>This link will expire in 1 hour.</Text>
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
