import { Actions, EmptyState } from "@better-giving/ui";
import { AlertTriangleIcon, CheckCircle2Icon, XCircleIcon } from "lucide-react";
import { useFetcher, useNavigate } from "react-router";
import { RouteModal } from "#/components/route-modal";
import { humanize } from "@/helpers/decimal";
import type { Route } from "./+types/route";
import type {
  action,
  DistPreview,
  RefundState,
  StripeRefundStatus,
} from "./api";

export { action, loader } from "./api";

export default function Page({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate();
  const close = () =>
    navigate("..", { preventScrollReset: true, replace: true });

  return (
    <RouteModal size="lg" classes="bg-panel">
      <Content data={loaderData} on_close={close} />
    </RouteModal>
  );
}

function Content({
  data,
  on_close,
}: {
  data: Route.ComponentProps["loaderData"];
  on_close: () => void;
}) {
  const fetcher = useFetcher<typeof action>();
  const failed = fetcher.data?.ok === false ? fetcher.data : null;
  const failures = failed?.failures ?? [];
  const submitting = fetcher.state !== "idle";
  const has_blockers = data.previews.some((p) => p.blockers.length > 0);
  const no_dists = data.previews.length === 0;
  const has_warnings = data.total_loss > 0;

  if (fetcher.data?.ok === true) {
    return (
      <div className="p-6 sm:p-8 text-center">
        <CheckCircle2Icon className="mx-auto mb-3 text-success pictogram-md" />
        <h3 className="text-lg font-bold mb-1">Refund processed</h3>
        <RefundOutcome status={fetcher.data.stripe_refund} />
        <button type="button" onClick={on_close} className="btn btn-primary">
          Close
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="p-6 sm:p-8">
        <h3 className="text-lg font-bold mb-1">Refund preview</h3>
        <p className="text-sm text-gray-11 mb-4">
          {data.donation_id}
          {data.already_refunded && (
            <span className="ml-2 text-destructive-subtle-fg text-xs font-semibold">
              Already refunded
            </span>
          )}
        </p>

        {data.previews.length === 0 ? (
          <EmptyState>No distributions yet</EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>NPO</th>
                  <th className="text-right">Gross</th>
                  <th className="text-right">Net</th>
                  <th>Effects</th>
                  <th>Warnings</th>
                  <th>Blockers</th>
                </tr>
              </thead>
              <tbody>
                {data.previews.map((p) => (
                  <PreviewRow key={p.id} preview={p} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {has_warnings && (
        <div className="mx-6 sm:mx-8 mb-2 p-3 rounded bg-warning-subtle border border-warning flex items-center gap-2 text-sm text-warning-subtle-fg">
          <AlertTriangleIcon className="shrink-0 icon-md" />
          <span>
            ${humanize(data.total_loss)} will be recorded as platform loss
          </span>
        </div>
      )}

      <div role="alert" id="refund-failures">
        {failures.length > 0 && (
          <div className="mx-6 sm:mx-8 mb-2 p-3 rounded bg-destructive-subtle border border-destructive text-sm text-destructive-subtle-fg">
            <p className="font-semibold">Refund not completed</p>
            {failed && <p>{failure_lead(failed)}</p>}
            <ul className="list-disc pl-5 mt-1">
              {failures.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <Actions band>
        <button
          type="button"
          disabled={submitting}
          onClick={on_close}
          className="btn-secondary btn"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={
            submitting || data.already_refunded || has_blockers || no_dists
          }
          aria-describedby="refund-failures"
          onClick={() => fetcher.submit(null, { method: "post" })}
          className="btn btn-primary"
        >
          {submitting
            ? "Refunding..."
            : has_warnings
              ? "Confirm refund (with loss)"
              : "Confirm refund"}
        </button>
      </Actions>
    </div>
  );
}

interface IIncompleteRefund {
  refund: RefundState;
  /** dists this attempt reversed; null when it stopped without counting */
  reversed: number | null;
}

function failure_lead({ refund, reversed }: IIncompleteRefund): string {
  switch (refund) {
    case "not_issued":
      return "No Stripe refund was issued and nothing was reversed. Resolve these before retrying:";
    case "unknown":
      return "Stripe didn't confirm whether the refund was issued, and nothing was reversed. Retry: a retry finds the same refund rather than issuing a second one.";
    case "requires_action":
      return "The Stripe refund needs action before Stripe sends it, so nothing was reversed yet. Retry once Stripe shows it pending or succeeded:";
    case "issued":
      if (reversed === null) {
        return "The Stripe refund was issued, but the reversal stopped with an error and the donation is still settled. Some distributions may already be reversed. Retry to finish it:";
      }
      if (reversed === 0) {
        return "The Stripe refund was issued, but no distribution was reversed and the donation is still settled. Resolve these:";
      }
      return `The Stripe refund was issued and ${reversed} distribution(s) were reversed, but the rest couldn't be and the donation is still settled. Resolve these:`;
  }
}

interface IRefundOutcome {
  status: StripeRefundStatus;
}

function RefundOutcome({ status }: IRefundOutcome) {
  return (
    <p className="text-sm text-gray-11 mb-4">
      {status === "succeeded"
        ? "All records have been reversed and the Stripe refund completed."
        : "All records have been reversed. The Stripe refund was submitted and is awaiting Stripe."}
    </p>
  );
}

function PreviewRow({ preview: p }: { preview: DistPreview }) {
  return (
    <tr className="text-sm">
      <td>{p.npo_name || p.npo_id || "—"}</td>
      <td className="text-right">${humanize(p.amount)}</td>
      <td className="text-right">${humanize(p.net)}</td>
      <td>
        <div className="flex flex-col gap-0.5">
          {p.effects.map((e, i) => (
            <span key={i} className="flex items-center gap-1 text-xs">
              <CheckCircle2Icon className="text-success shrink-0 icon-sm" />
              <span>
                {e.label}
                {e.reason && (
                  <span className="text-gray-11 ml-1">— {e.reason}</span>
                )}
              </span>
            </span>
          ))}
          {p.effects.length === 0 && (
            <span className="text-xs text-gray-11">—</span>
          )}
        </div>
      </td>
      <td>
        <div className="flex flex-col gap-0.5">
          {p.warnings.map((w, i) => (
            <span key={i} className="flex items-center gap-1 text-xs">
              <AlertTriangleIcon className="text-warning shrink-0 icon-sm" />
              <span>
                {w.label}
                {w.reason && (
                  <span className="text-gray-11 ml-1">— {w.reason}</span>
                )}
              </span>
            </span>
          ))}
          {p.warnings.length === 0 && (
            <span className="text-xs text-gray-11">—</span>
          )}
        </div>
      </td>
      <td>
        <div className="flex flex-col gap-0.5">
          {p.blockers.map((b, i) => (
            <span key={i} className="flex items-center gap-1 text-xs">
              <XCircleIcon className="text-destructive shrink-0 icon-sm" />
              <span>
                {b.label}
                {b.reason && (
                  <span className="text-gray-11 ml-1">— {b.reason}</span>
                )}
              </span>
            </span>
          ))}
          {p.blockers.length === 0 && (
            <span className="text-xs text-gray-11">—</span>
          )}
        </div>
      </td>
    </tr>
  );
}
