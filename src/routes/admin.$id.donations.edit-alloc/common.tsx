import { Banknote, Sprout, Trees, TrendingUp, Zap } from "lucide-react";
import type { IAllocation } from "@/donations";

export function to_alloc(input: string): IAllocation {
  const [a, b, c] = input.split("-").map((str) => Number.parseInt(str, 10));
  return { cash: a, liq: b, lock: c };
}

export function to_alloc_opt_value(input: IAllocation): string {
  const padNumber = (num: number): string => num.toString().padStart(3, "0");
  return `${padNumber(input.cash)}-${padNumber(input.liq)}-${padNumber(
    input.lock
  )}`;
}

export const alloc_opts = [
  {
    value: "000-000-100",
    label: "Endowment Builder",
    description: "100% Investment",
    icon: <Trees className="size-6 shrink-0 text-success" />,
  },
  {
    value: "000-025-075",
    label: "Long-Term Sustainability",
    description: "25% Savings, 75% Investment",
    icon: <Sprout className="size-6 shrink-0 text-success" />,
  },
  {
    value: "000-050-050",
    label: "Balanced Growth",
    description: "50% Savings, 50% Investment",
    icon: <TrendingUp className="size-5 shrink-0 text-primary" />,
  },
  {
    value: "025-050-025",
    label: "Short-Term Stability",
    description: "25% Grant, 50% Savings, 25% Investment",
    icon: <Banknote className="size-6 shrink-0 text-primary" />,
  },
  {
    value: "075-025-000",
    label: "Immediate Impact",
    description: "75% Grant, 25% Savings",
    icon: <Zap className="size-6 shrink-0 text-warning" />,
  },
];
