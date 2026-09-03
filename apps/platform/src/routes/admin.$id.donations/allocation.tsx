import { Arrow, Content, Tooltip } from "@better-giving/ui/tooltip";
import { CircleHelp, HandCoins, Pencil, PiggyBank, Sprout } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router";
import type { IAllocation } from "@/donations";

interface Props {
  allocation: IAllocation;
  classes?: string;
  disabled?: boolean;
}
export function Allocation(props: Props) {
  return (
    <div className={`grid rounded mt-4 ${props.classes ?? ""}`}>
      <div className="flex items-baseline gap-x-2 mb-1">
        <h2 className="mb-1">Distribution</h2>

        <NavLink
          title="Edit allocation settings"
          to="edit-alloc"
          replace
          preventScrollReset
          aria-disabled={props.disabled}
          className="hover:text-primary disabled:text-gray-11 [.pending]:text-gray-11"
        >
          <Pencil size={14} />
        </NavLink>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <Row
          icon={<HandCoins className="size-4 mr-2 text-gray-11" />}
          title={
            <div className="flex items-center">
              <span>Grants</span>
              <Tooltip
                tip={
                  <Content className="max-w-xs text-sm">
                    Donations received through Better Giving that will
                    distributed to your bank account.
                    <Arrow />
                  </Content>
                }
              >
                <CircleHelp size={14} className="text-gray-11 ml-1" />
              </Tooltip>
            </div>
          }
          pct={props.allocation.cash}
        />
        <Row
          icon={<PiggyBank width={20} className="mr-2 text-warning" />}
          title={<span>Savings</span>}
          pct={props.allocation.liq}
        />

        <Row
          icon={<Sprout size={20} className="mr-2 text-success" />}
          title={<span>Investments</span>}
          pct={props.allocation.lock}
        />
      </div>
    </div>
  );
}

interface IRow {
  pct: number;
  icon: ReactNode;
  title: ReactNode;
}
function Row(props: IRow) {
  return (
    <div className="flex items-center bg-panel border rounded p-4">
      {props.icon}
      {props.title}
      <span className="ml-12 text-gray-11 font-medium text-sm ">
        {props.pct ?? 50} %
      </span>
    </div>
  );
}
