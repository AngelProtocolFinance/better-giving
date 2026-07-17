import { Outlet, useSearchParams } from "react-router";
import type { TStatus } from "@/donations";

const filter_options: { value: "" | TStatus; label: string }[] = [
  { value: "", label: "All Statuses" },
  { value: "settled", label: "Settled" },
  { value: "refunded", label: "Refunded" },
  { value: "intent", label: "Awaiting Payment" },
  { value: "confirmed", label: "Confirmed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "expired", label: "Expired" },
];

export default function Layout() {
  const [params, set_params] = useSearchParams();
  const current = params.get("status") ?? "";

  return (
    <div className="grid content-start relative px-6 py-4 md:px-10 md:py-8">
      <div className="flex flex-wrap gap-y-4 justify-between items-center mb-2">
        <h1 className="text-3xl">My Donations</h1>
        <select
          value={current}
          onChange={(e) => {
            const p = new URLSearchParams(params);
            if (e.target.value) {
              p.set("status", e.target.value);
            } else {
              p.delete("status");
            }
            // reset cursor when changing filter
            p.delete("next");
            set_params(p);
          }}
          className="rounded border border-border bg-card px-3 py-1.5 text-sm font-medium text-fg focus:outline-primary"
        >
          {filter_options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <Outlet />
    </div>
  );
}
