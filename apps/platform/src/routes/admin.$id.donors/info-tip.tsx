import { InfoIcon } from "lucide-react";
import { Arrow, Content, Tooltip } from "#/components/tooltip";

interface IProps {
  label: string;
}

export function InfoTip({ label }: IProps) {
  return (
    <Tooltip
      tip={
        <Content className="max-w-xs rounded bg-card p-3 text-xs text-fg shadow-lg">
          {label}
          <Arrow />
        </Content>
      }
    >
      <span className="inline-flex cursor-help text-muted-fg">
        <InfoIcon size={12} />
      </span>
    </Tooltip>
  );
}
