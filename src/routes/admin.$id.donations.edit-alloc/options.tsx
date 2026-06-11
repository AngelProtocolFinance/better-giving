import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import type { IAllocation } from "@/npo";
import { alloc_opts, to_alloc, to_alloc_opt_value } from "./common";

interface Props {
  value: IAllocation;
  onChange: (val: IAllocation) => void;
}
export function AllocationOptions(props: Props) {
  return (
    <RadioGroup
      value={to_alloc_opt_value(props.value)}
      onValueChange={(v) => props.onChange(to_alloc(v))}
      className="grid grid-cols-[auto_1fr] gap-y-2"
    >
      {alloc_opts.map((option) => (
        // biome-ignore lint/a11y/noLabelWithoutControl: wraps Radio.Root
        <label
          key={option.value}
          className="grid grid-cols-subgrid col-span-full items-center group"
        >
          <Radio.Root value={option.value} />
          <span className="flex flex-1 gap-x-3 items-center group-has-data-checked:bg-secondary border group-has-data-checked:border-primary group-hover:ring-1 group-hover:border-primary px-2 py-4 rounded">
            {option.icon}
            <div className="grid gap-y-2">
              <p className="text-sm font-medium leading-none">{option.label}</p>
              <p className="text-sm text-muted-fg">{option.description}</p>
            </div>
          </span>
        </label>
      ))}
    </RadioGroup>
  );
}
