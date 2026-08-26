import { flat_colors } from "@better-giving/brand/flat";
import { Button, Text } from "react-email";
import { PublicLayout } from "../components/public-layout";
import { APP_NAME } from "../constants";

export interface IData {
  reference_id: string;
  /** back into the application, on the step it was left at. for an applicant
   * whose address is still unproven this also signs them in — the cookie their
   * browser holds is short-lived and does not travel to a second device. */
  resume_url: string;
}

function Jsx({ reference_id, resume_url }: IData) {
  return (
    <PublicLayout type="registration">
      <Text>Hello,</Text>
      <Text>
        From all of us: <strong>thanks a lot</strong> for registering to Better
        Giving. We are one step closer to providing your organization with more
        reliable funding, and nothing could make us happier.
      </Text>
      <Button
        href={resume_url}
        style={{
          display: "block",
          width: "100%",
          textAlign: "center",
          backgroundColor: flat_colors.primary,
          color: flat_colors.primary_fg,
          fontWeight: 600,
          fontSize: 16,
          padding: "14px 0",
          borderRadius: 6,
          margin: "24px 0",
        }}
      >
        Continue your application
      </Button>
      <Text style={{ textAlign: "center", marginBottom: 2 }}>
        Or quote your registration reference number:
      </Text>
      <Text
        style={{
          textAlign: "center",
          fontFamily: "monospace",
          fontWeight: 600,
          margin: 0,
          fontSize: 18,
        }}
      >
        {reference_id}
      </Text>
      <Text>
        Please don't hesitate to get in touch with us if you need any support.
        We'd be delighted to help you through the process!
      </Text>
      <Text>
        Looking forward to having you and your organization fully on board!
      </Text>
    </PublicLayout>
  );
}

export const template = (data: IData) => {
  return {
    node: <Jsx {...data} />,
    subject: `Welcome to ${APP_NAME}!`,
  };
};
