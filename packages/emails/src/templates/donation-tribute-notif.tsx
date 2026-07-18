import { Text } from "react-email";
import { PublicLayout } from "../components/public-layout";
import { format_amount } from "../helpers";
import type { IAmount, IDonor } from "../types";

export interface IData {
  in_honor_of: string;
  notif_to_full_name: string;
  from: IDonor & { title?: string };
  to_name: string;
  amount: IAmount;
  from_msg?: string;
}

function Jsx(d: IData) {
  const from_display = d.from.title
    ? `${d.from.title} ${d.from.full_name}`
    : d.from.full_name;

  return (
    <PublicLayout>
      <Text>Dear {d.notif_to_full_name},</Text>

      <Text>
        {d.from_msg || (
          <>
            This is to inform you that {from_display} has just made a donation
            to {d.to_name} for {format_amount(d.amount)}
          </>
        )}
      </Text>
    </PublicLayout>
  );
}

export const template = (data: IData) => {
  return {
    node: <Jsx {...data} />,
    subject: `Donation in honor of ${data.in_honor_of}`,
  };
};
