import { format } from "date-fns";
import { NavLink, Outlet, useSearchParams } from "react-router";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import { LoadMoreRow } from "#/components/load-more-row";
import { Money } from "#/components/money";
import { metas } from "#/helpers/seo";
import { use_table } from "#/hooks/use-table";
import type { IPaginator } from "#/types/components";
import type { Route } from "./+types/route";
import type { PaymentRow } from "./api";

export { loader } from "./api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();
export const meta: Route.MetaFunction = () => metas({ title: "Donations" });

export default CacheRoute(Page);
function Page({ loaderData: page1 }: Route.ComponentProps) {
  const [params] = useSearchParams();

  const { node } = use_table<PaymentRow>({
    table: (props) => <Table {...props} />,
    page1,
    gen_loader: (load, next) => () => {
      const copy = new URLSearchParams(params);
      if (next) copy.set("cursor", next);
      load(`?${copy.toString()}`);
    },
  });

  return (
    <div className="px-6 py-4 md:px-10 md:py-8 w-full max-w-5xl grid content-start">
      <h3 className="font-bold text-2xl mb-4">Donations</h3>

      <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-ring scrollbar-track-border">
        {node}
      </div>

      <Outlet />
    </div>
  );
}

/**
 * every stamp on the donation's match event, in lifecycle order.
 *
 * read-only, and there is no action here. nothing about a match is ours to
 * approve — no employer is resolved, no programme is known, and the sends are
 * claimed by the handlers themselves — so a button would only re-drive work
 * that is already at-most-once by construction.
 *
 * this is also the only reader `send_failed_kind` has: a mail the provider
 * refused is otherwise recorded and invisible, answerable only by hand-written
 * sql.
 */
function Match({ payment: c }: { payment: PaymentRow }) {
  const stamps = [
    ["pack", c.match_pack_sent_at],
    ["chased", c.match_chased_at],
    ["filed", c.match_submitted_at],
  ] as const;
  const reached = stamps.filter(([, at]) => at);

  return (
    <div className="flex flex-col items-start gap-0.5 min-w-32">
      <span
        className="text-xs font-medium truncate max-w-40"
        title={c.company_name ?? ""}
      >
        {/* donor-entered and never resolved — there is no employer row behind
            this string, so it is shown exactly as typed */}
        {c.company_name || <span className="text-muted-fg">No employer</span>}
      </span>
      {reached.length > 0 && (
        <span className="text-xs text-muted-fg">
          {reached
            .map(([label, at]) => `${label} ${format(new Date(at!), "MMM d")}`)
            .join(" · ")}
        </span>
      )}
      {c.match_voided_at && (
        <span className="text-xs text-muted-fg">
          voided · {c.match_void_reason}
        </span>
      )}
      {c.match_send_failed_kind && (
        <span className="text-destructive text-xs font-semibold">
          {c.match_send_failed_kind} mail refused
        </span>
      )}
    </div>
  );
}

interface ITableProps extends IPaginator<PaymentRow> {
  empty_msg?: string;
}

function Table({
  items,
  load_next,
  loading,
  disabled,
  empty_msg = "No settled donations found",
}: ITableProps) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Email</th>
          <th>NPO</th>
          <th>Amount</th>
          <th>Tip</th>
          <th>Fee Cover</th>
          <th>Fee</th>
          <th>Method</th>
          <th>Match</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {items.length === 0 ? (
          <tr>
            <td colSpan={10} className="text-center text-muted-fg py-8">
              {empty_msg}
            </td>
          </tr>
        ) : (
          items.map((p) => <Row key={p.donation_id} payment={p} />)
        )}
      </tbody>
      {load_next && (
        <LoadMoreRow
          col_span={10}
          disabled={disabled}
          loading={loading}
          on_load_next={load_next}
        />
      )}
    </table>
  );
}

function Row({ payment: c }: { payment: PaymentRow }) {
  const method = c.via.replace("stripe:", "").replace("nowpayments:", "");
  const is_stripe = c.via.startsWith("stripe:");
  return (
    <tr className="text-sm">
      <td className="whitespace-nowrap">
        {format(new Date(c.created_at), "MMM d, yyyy")}
      </td>
      <td className="truncate max-w-48" title={c.email ?? ""}>
        {c.email ?? "—"}
      </td>
      <td className="truncate max-w-48" title={c.npo_name ?? ""}>
        {c.npo_name ?? "—"}
      </td>
      <td className="font-medium">
        <Money amount={c.amount_base} currency={c.currency} />
      </td>
      <td>
        {c.amount_tip ? (
          <Money amount={c.amount_tip} currency={c.currency} />
        ) : (
          "—"
        )}
      </td>
      <td>
        {c.amount_fee_allowance ? (
          <Money amount={c.amount_fee_allowance} currency={c.currency} />
        ) : (
          "—"
        )}
      </td>
      <td>
        {c.sttl_fee ? (
          <Money amount={c.sttl_fee} currency={c.sttl_currency ?? "USD"} />
        ) : (
          "—"
        )}
      </td>
      <td>{method}</td>
      <td>
        <Match payment={c} />
      </td>
      <td>
        {c.status === "refunded" || c.status === "refunded_loss" ? (
          <span className="text-destructive text-xs font-semibold">
            {c.status === "refunded_loss" ? "Refunded (loss)" : "Refunded"}
          </span>
        ) : is_stripe ? (
          <NavLink
            to={`${c.donation_id}/refund`}
            preventScrollReset
            replace
            className="btn-secondary btn btn-sm"
          >
            Refund
          </NavLink>
        ) : (
          <span className="text-muted-fg text-xs">N/A</span>
        )}
      </td>
    </tr>
  );
}
