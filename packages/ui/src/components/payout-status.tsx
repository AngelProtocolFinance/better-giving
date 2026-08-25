/** the payout status vocabulary, declared here rather than imported: a design
 * system owns no domain module. it mirrors `PayoutStatus["type"]` in the app's
 * `lib/payouts` — if the two ever diverge, the call site stops type-checking,
 * which is the point. */
export type PayoutStatusType =
  | "error"
  | "settled"
  | "pending"
  | "refunded"
  | "refunded_loss"
  | "cancelled";

interface IConfig {
  text: string;
  dot: string;
  label: string;
}

const configs: Record<PayoutStatusType, IConfig> = {
  pending: {
    text: "text-warning-subtle-fg",
    dot: "bg-warning",
    label: "Pending",
  },
  settled: { text: "text-success", dot: "bg-success", label: "Settled" },
  error: { text: "text-destructive", dot: "bg-destructive", label: "Error" },
  refunded: {
    text: "text-destructive",
    dot: "bg-destructive",
    label: "Refunded",
  },
  refunded_loss: {
    text: "text-success",
    dot: "bg-success",
    label: "Settled",
  },
  cancelled: {
    text: "text-gray-11",
    dot: "bg-gray-11",
    label: "Cancelled",
  },
};

const fallback: IConfig = {
  text: "text-gray-11",
  dot: "bg-gray-11",
  label: "",
};

interface IPayoutStatus {
  type: PayoutStatusType;
  classes?: string;
}

export function PayoutStatus({ type, classes = "" }: IPayoutStatus) {
  const cfg = configs[type] ?? { ...fallback, label: type };
  return (
    <span
      className={`${classes} inline-flex items-center gap-2 text-xs font-medium ${cfg.text}`}
    >
      <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}
