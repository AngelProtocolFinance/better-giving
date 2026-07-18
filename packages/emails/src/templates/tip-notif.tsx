import { KeyValue } from "../components/key-value";
import { PlatformLayout } from "../components/platform-layout";
import { format_amount } from "../helpers";
import type { IAmount } from "../types";

export interface IData {
  id: string;
  date: string; // pretty-utc
  amount: IAmount;
  to_name: string;
  to_id: string;
  is_recurring?: boolean;
}

function Jsx(d: IData) {
  return (
    <PlatformLayout>
      <KeyValue label="donation id" value={d.id} />
      <KeyValue label="donation date" value={d.date} />
      <KeyValue label="nonprofit id " value={d.to_id} />
      <KeyValue label="nonprofit name" value={d.to_name} />
      <KeyValue label="amount" value={format_amount(d.amount)} />
    </PlatformLayout>
  );
}

export const template = (data: IData) => {
  return {
    node: <Jsx {...data} />,
    subject: data.is_recurring ? `Recurring tip` : "Tip",
  };
};
