import { format, formatDistance } from "date-fns";
import { PencilIcon } from "lucide-react";
import { Link } from "react-router";
import { humanize } from "@/helpers/decimal";

interface Props {
  bal_cash: number;
  threshold: number;
  next_payout: string;
  pm?: { bank_summary: string };
  classes?: string;
}

export function Payout({ classes = "", ...p }: Props) {
  const progress = Math.min(p.bal_cash / p.threshold, 1);
  return (
    <div className={`${classes}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="space-x-1 mb-1">
          <span className="text-xs uppercase text-shadow-white text-shadow">
            total
          </span>
          <span className="font-bold text-shadow-white text-shadow">
            ${humanize(p.bal_cash)}
          </span>
        </div>
        <div className="space-x-1">
          <span className="text-xs">of</span>
          <span className="text-sm">${humanize(p.threshold)}</span>
          <Link
            to={{ pathname: "payout-min", search: `?min=${p.threshold}` }}
            replace
            preventScrollReset
            className="text-xs inline-block"
          >
            <PencilIcon size={12} />
          </Link>
        </div>
      </div>
      <div
        style={{
          backgroundImage: `linear-gradient(to right, var(--success) 0%, var(--success) ${Math.min(progress * 100, 100)}%, color-mix(in oklch, var(--success) 15%, transparent) ${Math.min(progress * 100, 100)}%, color-mix(in oklch, var(--success) 15%, transparent) 100%)`,
        }}
        className="py-1 rounded-full shadow-inner mb-2"
      />
      <p className="text-sm">
        {progress < 1 ? "Once desired amount is accumulated, " : ""}
        will be paid out to{" "}
        {
          <Link
            to="../banking"
            className="text-primary hover:text-primary font-medium"
          >
            {p.pm?.bank_summary || "your default payout method"}
          </Link>
        }{" "}
        on{" "}
        {
          <span className="">
            {format(p.next_payout, "PP")}
            <span className="text-muted-fg">
              - in {formatDistance(p.next_payout, new Date())}
            </span>
            .
          </span>
        }
      </p>
    </div>
  );
}
