import {
  ArrowDownToLineIcon,
  ArrowLeftRightIcon,
  ArrowUpFromLineIcon,
} from "lucide-react";
import { NavLink } from "react-router";
import { Cell, Pie, PieChart } from "recharts";
import {
  Arrow as HoverArrow,
  Content as HoverContent,
} from "#/components/hover-card";
import { Info } from "#/components/status";
import { Arrow, Content } from "#/components/tooltip";
import { use_admin_data } from "#/pages/admin/use-admin-data";
import { humanize } from "@/helpers/decimal";
import type { TickerCategory } from "@/nav/interfaces";
import { group_by_category } from "@/nav/interfaces";
import { min_payout_amount } from "@/npo/schema";
import type { DashboardData } from "./api";

const category_colors: Record<TickerCategory | "other", string> = {
  equities: "#3b82f6",
  fixed_income: "#6b7280",
  crypto: "#f7931a",
  commodities: "#ffd700",
  cash: "#22c55e",
  other: "#64748b",
};

import { GrantsTable } from "./common/grants-table";
import { PayoutsTable } from "./common/payouts-table";
import { Figure } from "./figure";
import { Payout } from "./payout";

interface Props extends DashboardData {
  classes?: string;
}

export function Loaded({ classes = "", ...props }: Props) {
  const data = use_admin_data();
  const payout_min = data?.endow.payout_minimum ?? min_payout_amount;

  return (
    <div className={`${classes} mt-6`}>
      <div className="grid gap-4 @lg:grid-cols-2">
        <Figure
          title="Savings"
          to="../savings"
          tooltip={
            <Content className="bg-popover outline outline-border text-popover-fg text-sm max-w-xs p-4 rounded">
              Funds held in Fidelity Government Money Market (SPAXX) consisting
              of cash, US Government Securities and Repurchase Agreements
              <Arrow />
            </Content>
          }
          amount={`$${humanize(props.bal_liq, 2)}`}
        />
        <Figure
          title="Investments"
          to="../investments"
          hover_content={
            <HoverContent className="bg-popover outline outline-border text-popover-fg text-sm w-80 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] overflow-y-auto scrollbar-thin scrollbar-thumb-ring scrollbar-track-border p-4 rounded shadow-lg">
              <span className="block mb-2 font-medium">
                Portfolio composition
              </span>
              {(() => {
                const groups = group_by_category(
                  props.composition,
                  props.total_inv_value
                ).filter((g) => g.pct > 0);
                const pie_data = groups.map((g) => ({
                  category: g.category,
                  pct: g.pct,
                }));
                return (
                  <>
                    <PieChart width={150} height={150} className="mx-auto">
                      <Pie
                        data={pie_data}
                        dataKey="pct"
                        nameKey="category"
                        cx="50%"
                        cy="50%"
                        innerRadius={30}
                        outerRadius={55}
                        strokeWidth={0}
                      >
                        {pie_data.map((d) => (
                          <Cell
                            key={d.category}
                            fill={
                              category_colors[d.category as TickerCategory] ??
                              category_colors.other
                            }
                          />
                        ))}
                      </Pie>
                    </PieChart>
                    {groups.map((g) => (
                      <div key={g.category} className="mb-2 last:mb-0">
                        <div className="flex items-center justify-between font-medium">
                          <span className="flex items-center gap-1.5 capitalize">
                            <span
                              className="inline-block size-2.5 rounded-full"
                              style={{
                                backgroundColor:
                                  category_colors[
                                    g.category as TickerCategory
                                  ] ?? category_colors.other,
                              }}
                            />
                            {g.category.replace("_", " ")}
                          </span>
                          <span>{g.pct.toFixed(1)}%</span>
                        </div>
                      </div>
                    ))}
                  </>
                );
              })()}
              <HoverArrow />
            </HoverContent>
          }
          amount={`$ ${humanize(props.bal_lock, 2)}`}
          // perf={<SfPerf id={props.id} />}
        />
      </div>
      <div className="flex items-center gap-4 mt-4">
        <NavLink
          to="deposit"
          className="btn-success rounded px-4.5 py-2.5 text-sm flex items-center gap-2"
        >
          <ArrowUpFromLineIcon size={16} />
          Deposit
        </NavLink>
        <NavLink
          to="withdraw"
          className="btn-secondary rounded px-4.5 py-2.5 text-sm flex items-center gap-2"
        >
          <ArrowDownToLineIcon size={16} />
          Withdraw
        </NavLink>
        <NavLink
          to="transfer"
          className="btn-warning rounded px-4.5 py-2.5 text-sm flex items-center gap-2"
        >
          <ArrowLeftRightIcon size={16} />
          Transfer
        </NavLink>
      </div>

      <div className="w-full mt-16 h-1.5 bg-muted rounded-full shadow-inner" />

      {/** div scopes when the sticky header ends */}
      <div className="@container/period mt-2">
        <div className="flex items-center gap-x-2 mb-2">
          <h4 className="text-lg">Grant items</h4>
          {props.recent_payouts.items.length > 0 && (
            <NavLink to="payouts" className="text-primary text-sm">
              see all
            </NavLink>
          )}
        </div>

        {props.recent_payouts.items.length > 0 ? (
          <PayoutsTable
            classes="mt-2 mb-3"
            items={props.recent_payouts.items}
          />
        ) : (
          <Info classes="mt-2 mb-3">No grant items</Info>
        )}

        {props.recent_payouts.items.length > 0 && (
          <Payout
            next_payout={props.next_payout}
            bal_cash={props.bal_cash}
            threshold={payout_min}
            pm={props.pm}
            classes=""
          />
        )}

        <div className="flex items-center gap-x-2 mb-2 mt-8">
          <h4 className="text-lg">Payout history</h4>
          {props.recent_settlements.next &&
            props.recent_settlements.items.length > 0 && (
              <NavLink to="grants" className="text-primary text-sm">
                see all
              </NavLink>
            )}
        </div>
        {props.recent_settlements.items.length > 0 ? (
          <GrantsTable items={props.recent_settlements.items} />
        ) : (
          <Info>No payout records</Info>
        )}
      </div>
    </div>
  );
}
