import type { ReactNode } from "react";
import { Money } from "#/components/money";
import { party_kind, party_name } from "./party";
import type { IOwedRow } from "./types";

interface IRowSummary {
  row: IOwedRow;
  /** the figure's label: what the dialog will act on */
  amount_label: string;
}

export function RowSummary({ row, amount_label }: IRowSummary) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
      <Line term="Gift">
        <span className="font-mono text-xs break-all">{row.donation_id}</span>
      </Line>
      <Line term="Party">
        {party_name(row)}{" "}
        <span className="text-gray-11">· {party_kind[row.party]}</span>
      </Line>
      <Line term={amount_label}>
        <Money
          amount={row.outstanding_usd}
          currency="USD"
          classes="font-semibold"
        />
      </Line>
    </dl>
  );
}

interface ILine {
  term: string;
  children: ReactNode;
}

function Line({ term, children }: ILine) {
  return (
    <div className="col-span-full grid grid-cols-subgrid">
      <dt className="text-gray-11">{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}
