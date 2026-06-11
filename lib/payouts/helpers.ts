import type { PayoutStatus } from "./interfaces";

interface IPayoutStatusConfig {
  text: string;
  dot: string;
}

const configs: Record<PayoutStatus["type"], IPayoutStatusConfig> = {
  pending: { text: "text-warning", dot: "bg-warning" },
  settled: { text: "text-success", dot: "bg-success" },
  error: { text: "text-destructive", dot: "bg-destructive" },
  refunded: { text: "text-destructive", dot: "bg-destructive" },
  refunded_loss: { text: "text-success", dot: "bg-success" },
  cancelled: { text: "text-muted-fg", dot: "bg-muted-fg" },
};

const labels: Record<PayoutStatus["type"], string> = {
  pending: "Pending",
  settled: "Settled",
  error: "Error",
  refunded: "Refunded",
  refunded_loss: "Settled",
  cancelled: "Cancelled",
};

export function payout_status_config(
  s: PayoutStatus["type"]
): IPayoutStatusConfig {
  return configs[s] ?? { text: "text-muted-fg", dot: "bg-muted-fg" };
}

export function payout_status_label(s: PayoutStatus["type"]): string {
  return labels[s] ?? s;
}
