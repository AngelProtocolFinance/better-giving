import { Actions, EmptyState } from "@better-giving/ui";
import { AlertTriangleIcon, CheckCircle2Icon, XCircleIcon } from "lucide-react";
import { useFetcher, useNavigate } from "react-router";
import { RouteModal } from "#/components/route-modal";
import { humanize } from "@/helpers/decimal";
import type { Route } from "./+types/route";
import type { action, DistPreview, StripeRefundStatus } from "./api";

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
  const failures = fetcher.data?.ok === false ? fetcher.data.failures : [];
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
            <p>
              Some distributions couldn't be reversed, so no Stripe refund was
              issued and the donation is still settled. Resolve these before
              retrying:
            </p>
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

function RefundOutcome({ status }: { status: StripeRefundStatus | null }) {
  if (status === "failed" || status === "canceled") {
    return (
      <div className="mb-4 p-3 rounded bg-destructive-subtle border border-destructive text-sm text-destructive-subtle-fg text-left">
        <p className="font-semibold">Stripe refund not completed</p>
        <p>
          All records have been reversed, but Stripe did not complete the
          refund, so the donor has not been refunded. Resolve it in Stripe.
        </p>
      </div>
    );
  }
  return (
    <p className="text-sm text-gray-11 mb-4">
      {status === null
        ? "All records have been reversed. No Stripe refund was issued, so no money was moved."
        : status === "succeeded"
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
