import { RadioGroup } from "@ark-ui/react/radio-group";
import type { IAllocation } from "@/donations";
import { alloc_opts, to_alloc, to_alloc_opt_value } from "./common";

interface Props {
  value: IAllocation;
  onChange: (val: IAllocation) => void;
}
export function AllocationOptions(props: Props) {
  return (
    <RadioGroup.Root
      value={to_alloc_opt_value(props.value)}
      onValueChange={(e) => e.value && props.onChange(to_alloc(e.value))}
      className="grid grid-cols-[auto_1fr] gap-y-2"
    >
      {alloc_opts.map((option) => (
        <RadioGroup.Item
          key={option.value}
          value={option.value}
          className="grid grid-cols-subgrid col-span-full items-center group"
        >
          <RadioGroup.ItemControl />
          <RadioGroup.ItemHiddenInput />
          <span className="flex flex-1 gap-x-3 items-center group-data-[state=checked]:bg-secondary border group-data-[state=checked]:border-primary group-hover:ring-1 group-hover:border-primary px-2 py-4 rounded">
            {option.icon}
            <div className="grid gap-y-2">
              <p className="text-sm font-medium leading-none">{option.label}</p>
              <p className="text-sm text-muted-fg">{option.description}</p>
            </div>
          </span>
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
