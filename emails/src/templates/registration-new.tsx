import { Text } from "react-email";
import { PublicLayout } from "../components/public-layout";
import { APP_NAME } from "../constants";

export interface IData {
  reference_id: string;
}

function Jsx({ reference_id }: IData) {
  return (
    <PublicLayout type="registration">
      <Text>Hello,</Text>
      <Text>
        From all of us: <strong>thanks a lot</strong> for registering to Better
        Giving. We are one step closer to providing your organization with more
        reliable funding, and nothing could make us happier.
      </Text>
      <Text style={{ textAlign: "center", marginBottom: 2 }}>
        Your registration reference number is:
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
