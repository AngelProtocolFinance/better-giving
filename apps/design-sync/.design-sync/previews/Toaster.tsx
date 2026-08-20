import { useEffect } from "react";
// `show_toast` is the imperative half of this component and is NOT on the
// design-system export surface (.design-sync/entry.tsx exports only `Toaster`),
// so both halves are imported from the source module here — they share one
// module-scope toast manager, and importing `Toaster` from "@better-giving/ui" while
// pushing through a second copy of the manager would render nothing.
import {
  show_toast,
  Toaster,
} from "../../../../packages/ui/src/components/toaster";

type Toast = { type?: "success" | "error" | "info"; message: string };

// toasts are pushed imperatively, never rendered — this mounts them so the
// card shows the component's only visible state.
function Emit({ toasts }: { toasts: Toast[] }) {
  useEffect(() => {
    // deferred by a tick: `Emit` is a child of `Toaster`, so its effect runs
    // before ArkToaster subscribes to the manager, and a toast created first
    // is never picked up.
    const id = setTimeout(() => {
      for (const t of toasts) show_toast(t);
    }, 0);
    return () => clearTimeout(id);
  }, [toasts]);
  return null;
}

// the page underneath a toast — kept realistic so the overlay reads in context.
function MembersPanel() {
  return (
    <div className="w-96 overflow-hidden rounded border bg-card">
      <div className="border-b bg-muted px-4 py-3 text-sm font-medium text-fg">
        Members — Rainforest Trust
      </div>
      {[
        { name: "Amara Osei", email: "amara@rainforesttrust.org" },
        { name: "Daniel Reyes", email: "daniel@rainforesttrust.org" },
      ].map((m) => (
        <div
          key={m.email}
          className="flex items-center gap-4 border-b px-4 py-3"
        >
          <div className="flex flex-col">
            <span className="text-sm text-fg">{m.name}</span>
            <span className="text-xs text-muted-fg">{m.email}</span>
          </div>
          <button type="button" className="btn btn-ghost ml-auto px-4 py-1.5">
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

export const SuccessToast = () => (
  <Toaster>
    <MembersPanel />
    <Emit
      toasts={[{ type: "success", message: "Payout of $1,200.00 requested" }]}
    />
  </Toaster>
);

export const ErrorToast = () => (
  <Toaster>
    <MembersPanel />
    <Emit
      toasts={[
        {
          type: "error",
          message: "You can't remove yourself from this nonprofit",
        },
      ]}
    />
  </Toaster>
);

export const InfoToast = () => (
  <Toaster>
    <MembersPanel />
    <Emit
      toasts={[
        {
          type: "info",
          message:
            "Your donation receipt was sent to amara@rainforesttrust.org",
        },
      ]}
    />
  </Toaster>
);
