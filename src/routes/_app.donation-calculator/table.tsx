import { Tabs } from "@ark-ui/react/tabs";
import { TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import laira_coin from "#/assets/laira/laira-coin.webp";
import { Image } from "#/components/image";
import { to_usd } from "#/helpers/to-usd";
import type { View } from "./types";
import { Usd } from "./usd";

interface Props extends View {
  classes?: string;
}

export function Table({ classes = "", ...v }: Props) {
  const [tab, set_tab] = useState("1 Year");
  // Array of time periods
  const periods = [
    { label: "1 Year", value: 1 },
    { label: "5 Year", value: 5 },
    { label: "10 Year", value: 10 },
  ];

  const period = periods.find((p) => p.label === tab)!;
  const p = v.projection[period.value - 1];

  return (
    <div className={`${classes} p-6 @container`}>
      <div
        className={`${
          p.total > 0
            ? "bg-success/10"
            : p.total < 0
              ? "bg-destructive/10"
              : "bg-muted"
        } p-4 @md:p-6 rounded @md:flex items-center gap-4 mb-2`}
      >
        {p.total > 0 ? (
          <TrendingUp size={40} className="size-8 sm:size-10 text-success" />
        ) : p.total < 0 ? (
          <TrendingDown
            size={40}
            className="size-8 sm:size-10 text-destructive"
          />
        ) : null}
        <div>
          <p className="sm:text-lg font-bold text-balance">
            {tab} Savings & Investment Impact
          </p>
          <Usd classes="text-lg font-bold">{p.total}</Usd>
        </div>
        {p.total > 0 && (
          <Image
            src={laira_coin}
            width={70}
            className="@max-md:hidden ml-auto"
          />
        )}
      </div>
      {/* Tabs */}
      <Tabs.Root value={tab} onValueChange={(e) => set_tab(e.value)}>
        <Tabs.List className="flex space-x-1 border-b mb-4">
          {periods.map((p) => (
            <Tabs.Trigger
              key={p.value}
              value={p.label}
              className="flex-1 py-2.5 font-medium leading-5 focus:outline-none text-fg hover:text-primary data-selected:border-b-2 data-selected:border-primary data-selected:text-primary"
            >
              {p.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {/* Table Panels */}
        {periods.map((p) => {
          const x = v.projection[p.value - 1];
          return (
            <Tabs.Content key={p.value} value={p.label}>
              <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-ring scrollbar-track-border">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>{p.value === 1 ? "Allocation" : "Total Invested"}</th>
                      <th>Year {p.value} Balance</th>
                      <th>Growth</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Savings Account (4%)</td>
                      <td>{to_usd(x.end.liq - x.liq)}</td>
                      <td>{to_usd(x.end.liq)}</td>
                      <td>{to_usd(x.liq)}</td>
                    </tr>
                    <tr>
                      <td>Sustainability Fund (20%)</td>
                      <td>{to_usd(x.end.lock - x.lock)}</td>
                      <td>{to_usd(x.end.lock)}</td>
                      <td>{to_usd(x.lock)}</td>
                    </tr>
                    <tr>
                      <td>Total</td>
                      <td>{to_usd(x.end.total - x.total)}</td>
                      <td>{to_usd(x.end.total)}</td>
                      <td>{to_usd(x.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Tabs.Content>
          );
        })}
      </Tabs.Root>
    </div>
  );
}
