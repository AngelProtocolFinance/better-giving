import { ArrowDownToLine } from "lucide-react";
import { href, Link } from "react-router";
import { Amount } from "#/components/amount";
import { CsvExporter } from "#/components/csv-exporter";
import { ExtLink } from "#/components/ext-link";
import { LoadMoreRow } from "#/components/load-more-row";
import { PaymentResumer } from "#/pages/user-dashboard/donations/payment-resumer";
import type { IPaginator } from "#/types/components";
import { toPP } from "@/helpers/date";
import { type IRow, status_label, status_text_color } from "./helpers";

const csv_headers: { key: keyof IRow; label: string }[] = [
  { key: "id", label: "id" },
  { key: "date", label: "date" },
  { key: "status", label: "status" },
  { key: "recipient_name", label: "recipient" },
  { key: "recipient_id", label: "recipient id" },
  { key: "program_name", label: "program" },
  { key: "program_id", label: "program id" },
  { key: "currency", label: "currency" },
  { key: "amount", label: "amount" },
  { key: "usd_value", label: "usd value" },
  { key: "payment_method", label: "payment method" },
  { key: "frequency", label: "frequency" },
];

interface Props extends IPaginator<IRow> {}

export function Table({
  items,
  classes = "",
  disabled,
  loading,
  load_next,
}: Props) {
  return (
    <div className={classes}>
      <div className="flex items-center justify-end mb-2">
        <CsvExporter
          classes="hover:text-primary"
          headers={csv_headers}
          data={items}
          filename="my_donations.csv"
        >
          <ArrowDownToLine size={17} />
        </CsvExporter>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Recipient</th>
            <th>Amount</th>
            <th>Method</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={6} className="text-center text-muted-fg py-8">
                No donations found
              </td>
            </tr>
          ) : (
            items.map((row) => {
              return (
                <tr key={row.id}>
                  <td>{row.date ? toPP(row.date) : "--"}</td>
                  <td>
                    {row.recipient_type === "npo" ? (
                      <Link
                        to={href("/marketplace/:id", {
                          id: row.recipient_id,
                        })}
                        className="flex items-center justify-between gap-1 text-primary hover:text-primary"
                      >
                        <span className="truncate max-w-48">
                          {row.recipient_name}
                        </span>
                      </Link>
                    ) : (
                      <Link
                        to={href("/fundraisers/:fund_id", {
                          fund_id: row.recipient_id,
                        })}
                        className="flex items-center justify-between gap-1 text-primary hover:text-primary"
                      >
                        <span className="truncate max-w-48">
                          {row.recipient_name}
                        </span>
                      </Link>
                    )}
                    {row.program_id && row.recipient_type === "npo" && (
                      <Link
                        className="text-primary hover:text-primary"
                        to={href("/marketplace/:id/program/:program_id", {
                          id: row.recipient_id,
                          program_id: row.program_id,
                        })}
                      >
                        {row.program_name}
                      </Link>
                    )}
                  </td>
                  <td>
                    <Amount
                      classes={
                        row.status === "refunded"
                          ? "line-through text-destructive"
                          : ""
                      }
                      amount={row.amount}
                      currency={row.currency}
                      amount_usd={row.usd_value}
                    />
                    <p className="text-2xs uppercase">{row.frequency}</p>
                  </td>
                  <td className="capitalize">{row.payment_method}</td>
                  <td>
                    <span
                      className={`text-sm font-medium ${status_text_color(row.status)}`}
                    >
                      {status_label(row.status)}
                    </span>
                  </td>
                  <td>
                    <RowAction row={row} />
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
        {load_next && (
          <LoadMoreRow
            col_span={6}
            disabled={disabled}
            loading={loading}
            on_load_next={load_next}
          />
        )}
      </table>
    </div>
  );
}

/** contextual action: receipt for settled, payment resumer for intent/pending */
function RowAction({ row }: { row: IRow }) {
  // settled/refunded: receipt download
  if (
    row.status === "settled" ||
    row.status === "refunded" ||
    row.status === "refunded_loss"
  ) {
    return (
      <Link to={row.id} className="w-full flex justify-center">
        <ArrowDownToLine size={20} />
      </Link>
    );
  }

  // crypto intent: finish paying
  if (
    row.status === "intent" &&
    row.via_id.startsWith("crypto") &&
    row.via_extra
  ) {
    return <PaymentResumer payment_id={row.via_extra} amount={row.amount} />;
  }

  // stripe bank verification
  if (row.via_id.startsWith("stripe") && row.via_extra) {
    return (
      <ExtLink
        href={row.via_extra}
        className="text-xs text-primary hover:text-primary font-semibold"
      >
        Verify Bank
      </ExtLink>
    );
  }

  return null;
}
