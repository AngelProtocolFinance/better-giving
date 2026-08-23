import { EmptyState } from "@better-giving/ui";
import { AlertTriangleIcon, CheckCircle2Icon, XCircleIcon } from "lucide-react";
import { useFetcher, useNavigate } from "react-router";
import { RouteModal } from "#/components/route-modal";
import { humanize } from "@/helpers/decimal";
import type { Route } from "./+types/route";
import type { DistPreview } from "./api";

export { action, loader } from "./api";

export default function Page({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate();
  const close = () =>
    navigate("..", { preventScrollReset: true, replace: true });

  return (
    <RouteModal size="lg" classes="bg-popover">
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
  const fetcher = useFetcher();
  const done = fetcher.data != null;
  const submitting = fetcher.state !== "idle";
  const has_blockers = data.previews.some((p) => p.blockers.length > 0);
  const no_dists = data.previews.length === 0;
  const has_warnings = data.total_loss > 0;

  if (done) {
    return (
      <div className="p-6 sm:p-8 text-center">
        <CheckCircle2Icon className="mx-auto mb-3 text-success" size={40} />
        <h3 className="text-lg font-bold mb-1">Refund processed</h3>
        <p className="text-sm text-muted-fg mb-4">
          All records have been reversed and Stripe refund issued.
        </p>
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
        <p className="text-sm text-muted-fg mb-4">
          {data.donation_id}
          {data.already_refunded && (
            <span className="ml-2 text-destructive text-xs font-semibold">
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
          <AlertTriangleIcon size={16} className="shrink-0" />
          <span>
            ${humanize(data.total_loss)} will be recorded as platform loss
          </span>
        </div>
      )}

      <div className="modal-actions">
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
          onClick={() => fetcher.submit(null, { method: "post" })}
          className="btn btn-primary"
        >
          {submitting
            ? "Refunding..."
            : has_warnings
              ? "Confirm refund (with loss)"
              : "Confirm refund"}
        </button>
      </div>
    </div>
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
              <CheckCircle2Icon className="text-success shrink-0" size={14} />
              <span>
                {e.label}
                {e.reason && (
                  <span className="text-muted-fg ml-1">— {e.reason}</span>
                )}
              </span>
            </span>
          ))}
          {p.effects.length === 0 && (
            <span className="text-xs text-muted-fg">—</span>
          )}
        </div>
      </td>
      <td>
        <div className="flex flex-col gap-0.5">
          {p.warnings.map((w, i) => (
            <span key={i} className="flex items-center gap-1 text-xs">
              <AlertTriangleIcon className="text-warning shrink-0" size={14} />
              <span>
                {w.label}
                {w.reason && (
                  <span className="text-muted-fg ml-1">— {w.reason}</span>
                )}
              </span>
            </span>
          ))}
          {p.warnings.length === 0 && (
            <span className="text-xs text-muted-fg">—</span>
          )}
        </div>
      </td>
      <td>
        <div className="flex flex-col gap-0.5">
          {p.blockers.map((b, i) => (
            <span key={i} className="flex items-center gap-1 text-xs">
              <XCircleIcon className="text-destructive shrink-0" size={14} />
              <span>
                {b.label}
                {b.reason && (
                  <span className="text-muted-fg ml-1">— {b.reason}</span>
                )}
              </span>
            </span>
          ))}
          {p.blockers.length === 0 && (
            <span className="text-xs text-muted-fg">—</span>
          )}
        </div>
      </td>
    </tr>
  );
}
