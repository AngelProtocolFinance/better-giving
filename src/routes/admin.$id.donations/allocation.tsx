import { CircleHelp, HandCoins, Pencil, PiggyBank, Sprout } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { Arrow, Content, Tooltip } from "#/components/tooltip";
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
        <h4 className="mb-1">Distribution</h4>

        <NavLink
          title="Edit allocation settings"
          to="edit-alloc"
          replace
          preventScrollReset
          aria-disabled={props.disabled}
          className="hover:text-primary disabled:text-muted-fg [.pending]:text-muted-fg"
        >
          <Pencil size={14} />
        </NavLink>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <Row
          icon={<HandCoins className="size-4 mr-2 text-muted-fg" />}
          title={
            <div className="flex items-center">
              <span>Grants</span>
              <Tooltip
                tip={
                  <Content className="max-w-xs bg-popover outline outline-border p-4 text-popover-fg text-sm shadow-lg rounded">
                    Donations received through Better Giving that will
                    distributed to your bank account.
                    <Arrow />
                  </Content>
                }
              >
                <CircleHelp size={14} className="text-muted-fg ml-1" />
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
    <div className="flex items-center bg-card border rounded p-4">
      {props.icon}
      {props.title}
      <span className="ml-12 text-muted-fg font-medium text-sm ">
        {props.pct ?? 50} %
      </span>
    </div>
  );
}
