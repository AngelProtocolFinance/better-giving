import { format } from "date-fns";
import { NavLink, Outlet, useSearchParams } from "react-router";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import { Amount } from "#/components/amount";
import { LoadMoreRow } from "#/components/load-more-row";
import { metas } from "#/helpers/seo";
import { use_table } from "#/hooks/use-table";
import type { IPaginator } from "#/types/components";
import type { Route } from "./+types/route";
import type { PaymentRow } from "./api";

export { loader } from "./api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();
export const meta: Route.MetaFunction = () => metas({ title: "Refunds" });

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
      <h3 className="font-bold text-2xl mb-4">Refunds</h3>

      <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-ring scrollbar-track-border">
        {node}
      </div>

      <Outlet />
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
          <th />
        </tr>
      </thead>
      <tbody>
        {items.length === 0 ? (
          <tr>
            <td colSpan={9} className="text-center text-muted-fg py-8">
              {empty_msg}
            </td>
          </tr>
        ) : (
          items.map((p) => <Row key={p.donation_id} payment={p} />)
        )}
      </tbody>
      {load_next && (
        <LoadMoreRow
          col_span={9}
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
        <Amount amount={c.amount_base} currency={c.currency} />
      </td>
      <td>
        {c.amount_tip ? (
          <Amount amount={c.amount_tip} currency={c.currency} />
        ) : (
          "—"
        )}
      </td>
      <td>
        {c.amount_fee_allowance ? (
          <Amount amount={c.amount_fee_allowance} currency={c.currency} />
        ) : (
          "—"
        )}
      </td>
      <td>
        {c.sttl_fee ? (
          <Amount amount={c.sttl_fee} currency={c.sttl_currency ?? "USD"} />
        ) : (
          "—"
        )}
      </td>
      <td>{method}</td>
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
            className="btn-secondary btn text-xs px-2 py-0.5"
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
