import { Arrow, Content, Tooltip } from "@better-giving/ui/tooltip";
import { InfoIcon } from "lucide-react";

interface IProps {
  label: string;
}

export function InfoTip({ label }: IProps) {
  return (
    <Tooltip
      tip={
        <Content className="max-w-xs text-xs">
          {label}
          <Arrow />
        </Content>
      }
    >
      <span className="inline-flex cursor-help text-gray-11">
        <InfoIcon size={12} />
      </span>
    </Tooltip>
  );
}
