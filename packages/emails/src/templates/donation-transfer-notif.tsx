import { KeyValue } from "../components/key-value";
import { PlatformLayout } from "../components/platform-layout";

interface IStocksDetails {
  ticker: string;
  shares: string;
  amount: string;
}

interface IIraQcdDetails {
  amount: string;
  custodian?: string;
}

export interface IData {
  type: "stocks" | "ira_qcd";
  recipient_name: string;
  recipient_url: string;
  donor_email: string;
  details: IStocksDetails | IIraQcdDetails;
}

function is_stocks(
  type: IData["type"],
  details: IData["details"]
): details is IStocksDetails {
  return type === "stocks";
}

function Jsx(d: IData) {
  return (
    <PlatformLayout>
      <KeyValue
        label="Type"
        value={d.type === "stocks" ? "Stock Donation" : "IRA/QCD Donation"}
      />
      <KeyValue label="Recipient" value={d.recipient_name} />
      <KeyValue label="Recipient URL" value={d.recipient_url} />
      {is_stocks(d.type, d.details) ? (
        <>
          <KeyValue label="Ticker" value={d.details.ticker} />
          <KeyValue label="Shares" value={d.details.shares} />
          <KeyValue label="Amount" value={`$${d.details.amount}`} />
        </>
      ) : (
        <>
          <KeyValue label="Amount" value={`$${d.details.amount}`} />
          {d.details.custodian && (
            <KeyValue label="Custodian" value={d.details.custodian} />
          )}
        </>
      )}
      <KeyValue label="Donor" value={d.donor_email} />
    </PlatformLayout>
  );
}

export const template = (data: IData) => {
  return {
    node: <Jsx {...data} />,
    subject: "Donor confirmed — incoming transfer expected",
  };
};
