import { EmptyRow } from "@better-giving/ui";
import { to_utc_day } from "@/helpers/date";
import { humanize } from "@/helpers/decimal";
import type { IOwedHistoryRow, IOwedRunLine } from "$/pg/queries/owed-history";

export interface IOwedHistory {
  rows: IOwedHistoryRow[];
  /** what recovers a row for this party: its grants, or its commission payouts */
  run_noun: "grant" | "payout";
  /** what the party got from the gift */
  received_label: string;
}

const usd = (n: number) => `$${humanize(n)}`;

/** the party's owed rows; each line is `#owed-<id>`, which a run's
 * deductions link to */
export function OwedHistory({ rows, run_noun, received_label }: IOwedHistory) {
  return (
    <section aria-labelledby="owed-history" className="mt-8">
      <h3 id="owed-history" className="font-bold text-lg">
        Amounts owed
      </h3>
      <p className="text-sm text-gray-11 mt-1 mb-3 max-w-3xl">
        When a gift is refunded or disputed after you were paid for it, what you
        received and its fees are owed back and deducted from your next{" "}
        {run_noun}s.
      </p>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Gift</th>
              <th>Reason</th>
              <th>{received_label}</th>
              <th>Card fee</th>
              <th>Dispute fee</th>
              <th>Status</th>
              <th>Still owed</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow col_span={7}>No amounts owed yet</EmptyRow>
            ) : (
              rows.map((r) => (
                <tr key={r.id} id={`owed-${r.id}`}>
                  <td>
                    <div>{r.donation_id}</div>
                    <div className="text-xs text-gray-11">
                      {humanize(r.gift_amount)} {r.gift_currency} on{" "}
                      {to_utc_day(r.gift_date)}
                    </div>
                  </td>
                  <td>
                    {r.source === "refund" ? "Refund" : "Dispute"}{" "}
                    {to_utc_day(r.recorded_at)}
                  </td>
                  <td>{usd(r.received_usd)}</td>
                  <td>{usd(r.fee_processing_usd)}</td>
                  <td>{usd(r.fee_dispute_usd)}</td>
                  <td>
                    <div>{status(r)}</div>
                    {/* a row still owing reads as owed, so what settled part
                        of it before rides under its status */}
                    {r.state !== "credited_back" && r.credited_back_usd > 0 && (
                      <div className="text-xs text-gray-11">{credited(r)}</div>
                    )}
                    {r.state !== "waived" && r.written_off_usd > 0 && (
                      <div className="text-xs text-gray-11">{waived(r)}</div>
                    )}
                    {r.recoveries.map((l) => (
                      <div
                        key={`${l.run_ref}:${l.usd < 0}`}
                        className="text-xs text-gray-11"
                      >
                        {run_line(l, run_noun)}
                      </div>
                    ))}
                  </td>
                  <td>
                    {r.outstanding_usd < 0
                      ? `Due to you ${usd(-r.outstanding_usd)}`
                      : usd(r.outstanding_usd)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function status(r: IOwedHistoryRow): string {
  switch (r.state) {
    case "recorded":
      return "Owed";
    case "partly_recovered":
      return "Partly recovered";
    case "recovered":
      return "Recovered";
    case "credited_back":
      return credited(r);
    case "waived":
      return waived(r);
  }
}

// a credited or written-off figure is dated by the check constraints on it
const credited = (r: IOwedHistoryRow) =>
  `Credited back ${usd(r.credited_back_usd)} on ${to_utc_day(r.credited_back_at!)}`;
const waived = (r: IOwedHistoryRow) =>
  `Waived ${usd(r.written_off_usd)} on ${to_utc_day(r.written_off_at!)}`;

const run_line = (l: IOwedRunLine, run_noun: IOwedHistory["run_noun"]) =>
  l.usd < 0
    ? `${usd(-l.usd)} paid back with ${run_noun} of ${to_utc_day(l.at)}`
    : `${usd(l.usd)} from ${run_noun} of ${to_utc_day(l.at)}`;
