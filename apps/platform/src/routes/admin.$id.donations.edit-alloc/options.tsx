import { RadioGroup } from "@better-giving/ui";
import type { IAllocation } from "@/donations";
import { alloc_opts, to_alloc, to_alloc_opt_value } from "./common";

interface Props {
  value: IAllocation;
  onChange: (val: IAllocation) => void;
}
export function AllocationOptions(props: Props) {
  return (
    <RadioGroup
      variant="tile"
      label="Allocation"
      hideLabel
      value={to_alloc_opt_value(props.value)}
      onValueChange={(v) => props.onChange(to_alloc(v))}
      items={alloc_opts}
    />
  );
}
