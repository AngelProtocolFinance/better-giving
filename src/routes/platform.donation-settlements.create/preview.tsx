import { Tabs } from "@ark-ui/react/tabs";
import { CodeIcon, TableIcon } from "lucide-react";
import { humanize } from "@/helpers/decimal";
import type { IFormValues, ISettlementPreview } from "./types";

const LABELS: Record<string, string> = {
  tip: "Tip",
  "base-fee": "Base Fee",
  "fsa-fee": "FSA Fee",
  lock: "Investment",
  liq: "Savings",
};

interface IPreviewProps {
  form: IFormValues;
  preview: ISettlementPreview;
  submitting: boolean;
  error: string | null;
  on_back: () => void;
  on_confirm: () => void;
}

export function Preview({
  form,
  preview,
  submitting,
  error,
  on_back,
  on_confirm,
}: IPreviewProps) {
  return (
    <div>
      <div className="p-6 sm:p-8">
        <h3 className="text-lg font-bold mb-1">Confirm settlement</h3>
        <p className="text-sm text-muted-fg mb-4">
          Review the records that will be created
        </p>

        {error && <p className="text-xs text-destructive mb-4">{error}</p>}

        {/* donation */}
        <RecordSection title="Donation">
          <KV label="NPO" value={preview.npo_name} />
          <KV label="Donor" value={form.donor_name || "Anonymous"} />
          <KV label="Email" value={form.donor_email} />
          <KV label="Reference" value={form.reference} />
        </RecordSection>

        {/* records */}
        <RecordsTabs preview={preview} />
      </div>

      <div className="p-3 sm:px-8 sm:py-4 flex items-center justify-end gap-4 w-full bg-muted border-t">
        <button
          type="button"
          disabled={submitting}
          onClick={on_back}
          className="btn-secondary btn text-sm px-8 py-2"
        >
          Back
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={on_confirm}
          className="btn btn-primary px-8 py-2 text-sm"
        >
          {submitting ? "Settling..." : "Confirm"}
        </button>
      </div>
    </div>
  );
}

const tab_cls =
  "px-3 py-1.5 text-xs font-medium focus:outline-none text-muted-fg hover:text-fg data-selected:text-fg data-selected:border-b-2 data-selected:border-primary flex items-center gap-1";

function RecordsTabs({ preview }: { preview: ISettlementPreview }) {
  return (
    <section className="mb-4">
      <Tabs.Root defaultValue="table">
        <Tabs.List className="flex border-b mb-3">
          <Tabs.Trigger value="table" className={tab_cls}>
            <TableIcon size={14} />
            Records
          </Tabs.Trigger>
          <Tabs.Trigger value="json" className={tab_cls}>
            <CodeIcon size={14} />
            JSON
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="table">
          <table className="table w-full">
            <thead>
              <tr>
                <th className="text-left">Name</th>
                <th className="text-right">Details</th>
              </tr>
            </thead>
            <tbody>
              {preview.txs.map((tx, idx) => (
                <TxRow
                  key={idx}
                  tx={tx as Record<string, unknown>}
                  nav_price={preview.nav_price}
                />
              ))}
            </tbody>
          </table>
        </Tabs.Content>

        <Tabs.Content value="json">
          <pre className="text-xs bg-muted rounded p-3 overflow-x-auto max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-ring scrollbar-track-border">
            {JSON.stringify(preview.txs, null, 2)}
          </pre>
        </Tabs.Content>
      </Tabs.Root>
    </section>
  );
}

function TxRow({
  tx,
  nav_price,
}: {
  tx: Record<string, unknown>;
  nav_price: number;
}) {
  const r = tx._record;
  if (r === "distribution") {
    return (
      <tr>
        <td>Distribution</td>
        <td className="text-right tabular-nums">
          ${humanize(tx.net as number)}
        </td>
      </tr>
    );
  }
  if (r === "revenue_log") {
    const type = tx.type as string;
    return (
      <tr>
        <td>Revenue: {LABELS[type] ?? type}</td>
        <td className="text-right tabular-nums">
          ${humanize(tx.revenue as number)}
        </td>
      </tr>
    );
  }
  if (r === "commission") {
    return (
      <tr>
        <td>Commission: {(tx.referrer_user ?? tx.referrer_npo) as string}</td>
        <td className="text-right tabular-nums">
          ${humanize(tx.amount as number)}
        </td>
      </tr>
    );
  }
  if (r === "balance_tx") {
    const account = tx.account as string;
    return (
      <tr>
        <td>
          {LABELS[account] ?? account}
          <span className="text-muted-fg ml-1">
            {humanize(tx.bal_begin as number)} →{" "}
            {humanize(tx.bal_end as number)}
          </span>
        </td>
        <td className="text-right tabular-nums">
          +${humanize(tx.amount as number)}
          {account === "lock" && (
            <span className="text-muted-fg ml-1">
              ({humanize(tx.amount_units as number, 6)} units @ $
              {humanize(nav_price)}/unit)
            </span>
          )}
        </td>
      </tr>
    );
  }
  if (r === "payout") {
    return (
      <tr>
        <td>Grant</td>
        <td className="text-right tabular-nums">
          ${humanize(tx.amount as number)}
        </td>
      </tr>
    );
  }
  return null;
}

function RecordSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4">
      <h4 className="text-xs font-semibold text-muted-fg uppercase tracking-wide mb-2">
        {title}
      </h4>
      <div className="grid gap-1">{children}</div>
    </section>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 text-sm">
      <span className="text-muted-fg w-20 shrink-0">{label}</span>
      <span>{value}</span>
    </div>
  );
}
