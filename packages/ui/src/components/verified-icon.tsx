import { BadgeCheck } from "lucide-react";
import { Arrow, Content, Tooltip } from "./tooltip";

type Props = { size: number; classes?: string };

export function VerifiedIcon({ size, classes = "" }: Props) {
  return (
    <Tooltip
      tip={
        <Content className="text-sm">
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
