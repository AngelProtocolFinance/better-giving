import { Text } from "react-email";
import { PublicLayout } from "../components/public-layout";

export interface IData {
  to_name: string;
  opted_out_name: string;
}

function Jsx({ opted_out_name, to_name }: IData) {
  return (
    <PublicLayout type="fund">
      <Text>Hello {to_name},</Text>
      <Text>
        {opted_out_name} has opted out of your fundraiser. For further details
        regarding that, please contact {opted_out_name} directly.
      </Text>
    </PublicLayout>
  );
}

export const template = (data: IData) => {
  return {
    node: <Jsx {...data} />,
    subject: `${data.to_name} opted out of your fundraiser.`,
  };
};
