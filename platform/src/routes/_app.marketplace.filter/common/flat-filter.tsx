import type { GroupProps } from "./types";

export function FlatFilter<T>({ classes = "", ...props }: GroupProps<T>) {
  function toggle(value: T) {
    const selected = props.selectedValues.includes(value)
      ? props.selectedValues.filter((v) => v !== value)
      : [...props.selectedValues, value];
    props.onChange(selected);
  }

  return (
    <fieldset className={`grid px-2 py-4 ${classes}`}>
      <legend className="font-bold text-xs uppercase">{props.label}</legend>
      <div className="flex flex-wrap gap-x-1 gap-y-2">
        {props.options.map((option) => {
          const selected = props.selectedValues.includes(option.value);
          return (
            <button
              type="button"
              aria-pressed={selected}
              key={option.key}
              onClick={() => toggle(option.value)}
              className={`${
                selected ? "border-primary text-accent-fg bg-accent" : ""
              } border select-none rounded-full capitalize text-xs pt-1 pb-[.3rem] px-4`}
            >
              {option.displayText}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
