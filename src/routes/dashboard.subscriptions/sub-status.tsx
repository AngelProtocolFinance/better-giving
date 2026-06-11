import type { TStatus } from "@/subscriptions";

interface ISubStatus {
  status: TStatus;
  classes?: string;
}

export function SubStatus({ status, classes = "" }: ISubStatus) {
  const { text, color } =
    status === "active"
      ? { text: "Active", color: "text-success" }
      : { text: "Cancelled", color: "text-muted-fg" };

  return (
    <span className={`text-sm font-medium ${color} ${classes}`}>{text}</span>
  );
}
