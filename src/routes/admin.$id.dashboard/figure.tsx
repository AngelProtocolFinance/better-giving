import { ArrowRightIcon, CircleHelp } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { HoverCard } from "#/components/hover-card";
import { Tooltip } from "#/components/tooltip";

type Props = {
  title: string;
  /** e.g. $100,000 */
  amount: string;
  /** must be wrapped by tooltip content */
  tooltip?: ReactNode;
  /** when set, renders a HoverCard instead of tooltip */
  hover_content?: ReactNode;
  to: string;
};

export function Figure(props: Props) {
  const icon = <CircleHelp size={14} className="text-muted-fg ml-1" />;

  return (
    <div className="@container rounded border bg-card p-4">
      <div className="flex items-center mb-4">
        <h4 className="">{props.title}</h4>
        {props.hover_content ? (
          <HoverCard tip={props.hover_content}>{icon}</HoverCard>
        ) : (
          props.tooltip && <Tooltip tip={props.tooltip}>{icon}</Tooltip>
        )}

        <NavLink
          to={props.to}
          className="ml-auto text-primary hover:text-primary active:translate-x-0.5"
        >
          <ArrowRightIcon size={18} />
        </NavLink>
      </div>
      <div className="text-lg font-medium ">{props.amount}</div>
      {/* {props.actions} */}
    </div>
  );
}
