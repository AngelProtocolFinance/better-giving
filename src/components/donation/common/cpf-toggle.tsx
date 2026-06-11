import { Field } from "@base-ui/react/field";
import { Switch } from "@base-ui/react/switch";

interface Props {
  classes?: string;
  checked: boolean;
  checked_changed: (checked: boolean) => void;
}

export function CpfToggle({ classes = "", checked, checked_changed }: Props) {
  return (
    <Field.Root
      className={`group ${classes} gap-x-1 flex items-center text-sm justify-self-start`}
    >
      <Switch.Root
        checked={checked}
        onCheckedChange={(x) => checked_changed(x)}
        className="group relative text-xs flex items-center h-lh w-8 rounded-full bg-muted p-1 ease-in-out data-checked:bg-(--form-primary) focus-visible:outline-2 focus-visible:outline-(--form-primary) data-disabled:opacity-50"
      >
        <Switch.Thumb
          aria-hidden="true"
          className="pointer-events-none inline-block h-[0.8lh] aspect-square -translate-x-0.5 rounded-full bg-input transition-transform ease-in-out group-data-checked:translate-x-3.5"
        />
      </Switch.Root>
      <Field.Label className="whitespace-nowrap">
        Cover 3rd party processing fees
      </Field.Label>
    </Field.Root>
  );
}
