import { GripVertical } from "lucide-react";
import { Reorder, useDragControls, useMotionValue } from "motion/react";
import type { ReactNode, Ref } from "react";
import { unpack } from "#/helpers/unpack";
import type { TDonateMethod } from "#/types/components";

type Updator = (methods: TDonateMethod[]) => void;
type Classes = {
  container?: string;
  label?: string;
  tooltip?: string;
};

type Props = {
  values: TDonateMethod[];
  on_change: Updator;
  error?: ReactNode;
  classes?: Classes | string;
};

export function DonateMethods({
  values,
  on_change,
  error,
  classes,
  ref,
}: Props & { ref?: Ref<HTMLInputElement> }) {
  const style = unpack(classes);
  return (
    <div className={style.container}>
      <p className={`${style.label} mb-1 label`}>Donation methods</p>
      <p className={`text-muted-fg ${style.tooltip} mb-2 text-sm`}>
        Here you can turn on/off payment options and change the order of their
        appearance
      </p>
      <p className="text-destructive text-xs mb-2 empty:hidden">{error}</p>
      {/** focus this element on error */}
      <input className="sr-only" ref={ref} />
      <Reorder.Group
        axis="y"
        onReorder={(values) => on_change(values.map((v) => JSON.parse(v)))}
        values={values.map((v) => JSON.stringify(v))}
        className="grid gap-4"
      >
        {values.map((v) => (
          <Method
            value={v}
            key={v.id}
            updator={(updated) => {
              const _methods = values.map((v) => {
                if (v.id === updated.id) return updated;
                return v;
              });
              on_change(_methods);
            }}
          />
        ))}
      </Reorder.Group>
    </div>
  );
}

interface IMethod {
  value: TDonateMethod;
  updator: (old: TDonateMethod) => void;
}

function Method({ value, updator }: IMethod) {
  const y = useMotionValue(0);
  const controls = useDragControls();
  return (
    <Reorder.Item
      aria-disabled={value.disabled}
      value={JSON.stringify(value)}
      dragListener={false}
      dragControls={controls}
      id={value.id}
      style={{ y }}
      className="flex items-center gap-2 border p-3 aria-disabled:bg-muted aria-disabled:text-muted-fg rounded bg-card select-none"
    >
      <input
        type="checkbox"
        className="checkbox"
        checked={!value.disabled}
        onChange={(e) => {
          updator({ ...value, disabled: !e.target.checked });
        }}
      />
      <button
        type="button"
        className="text-xl disabled:pointer-events-none cursor-grab disabled:cursor-default"
        onPointerDown={(e) => controls.start(e)}
        disabled={value.disabled}
      >
        <GripVertical size={20} />
      </button>

      <span className="text-sm">{value.name}</span>
    </Reorder.Item>
  );
}
