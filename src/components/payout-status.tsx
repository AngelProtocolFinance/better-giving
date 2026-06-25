import type { PayoutStatus as PayoutStatusType } from "@/payouts";

interface IConfig {
  text: string;
  dot: string;
  label: string;
}

const configs: Record<PayoutStatusType["type"], IConfig> = {
  pending: { text: "text-warning", dot: "bg-warning", label: "Pending" },
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
    text: "text-muted-fg",
    dot: "bg-muted-fg",
    label: "Cancelled",
  },
};

const fallback: IConfig = {
  text: "text-muted-fg",
  dot: "bg-muted-fg",
  label: "",
};

interface IPayoutStatus {
  type: PayoutStatusType["type"];
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
