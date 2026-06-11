import { BadgeCheck } from "lucide-react";
import { Arrow, Content, Tooltip } from "./tooltip";

type Props = { size: number; classes?: string };

export function VerifiedIcon({ size, classes = "" }: Props) {
  return (
    <Tooltip
      tip={
        <Content className="bg-popover outline outline-border text-popover-fg px-4 py-2 rounded text-sm shadow-md z-10">
          Verified
          <Arrow />
        </Content>
      }
    >
      <BadgeCheck
        size={size}
        className={`text-primary-fg inline fill-primary ${classes}`}
      />
    </Tooltip>
  );
}
