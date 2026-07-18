import { KeyValue } from "../components/key-value";
import { PlatformLayout } from "../components/platform-layout";

export interface IData {
  /** in usd */
  amount: string;
  /** e.g. Better Giving */
  transactor: string;
  /** pretty utc */
  date: string;
  type: "redeem" | "invest";
}

function Jsx({ transactor, type, amount, date }: IData) {
  return (
    <PlatformLayout>
      <KeyValue label="Transactor" value={transactor} />
      <KeyValue
        label="Type"
        value={type === "invest" ? "Units Purchase" : "Redemption"}
      />
      <KeyValue label="Amount" value={`$${amount}`} />
      <KeyValue label="Date" value={date} />
    </PlatformLayout>
  );
}

export const template = (data: IData) => {
  return {
    node: <Jsx {...data} />,
    subject: `Investments: ${data.type === "invest" ? "units purchase" : "redemption request"} `,
  };
};
