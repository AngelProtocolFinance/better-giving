import { email_colors } from "@better-giving/brand/email";
import { Button, Text } from "react-email";
import { PublicLayout } from "../components/public-layout";
import { APP_NAME } from "../constants";

export interface IData {
  url: string;
  /** must quote the same ttl the auth config issues the link with */
  expires_in: string;
  first_name?: string;
}

function Jsx({ url, expires_in, first_name }: IData) {
  return (
    <PublicLayout>
      <Text>{first_name ? `Hi ${first_name},` : "Hello,"}</Text>
      <Text>
        Click the button below to confirm your email address and sign in to{" "}
        {APP_NAME}. No password needed.
      </Text>
      <Button
        href={url}
        style={{
          display: "block",
          width: "100%",
          textAlign: "center",
          backgroundColor: email_colors.primary,
          color: email_colors.primary_fg,
          fontWeight: 600,
          fontSize: 16,
          padding: "14px 0",
          borderRadius: 6,
          margin: "24px 0",
        }}
      >
        Confirm and sign in
      </Button>
      <Text>
        This link expires in {expires_in} and can only be used once. If it stops
        working, request a new one.
      </Text>
      <Text>
        If you didn't request this, you can safely ignore this email. Nobody can
        sign in without the link above.
      </Text>
    </PublicLayout>
  );
}

export const template = (data: IData) => {
  return {
    node: <Jsx {...data} />,
    subject: `Your ${APP_NAME} sign-in link`,
  };
};
