import { Slider } from "@base-ui/react/slider";
import { HandCoins, PiggyBank, Sprout } from "lucide-react";
import type { ReactNode } from "react";
import type { IAllocation } from "@/npo";

interface Props {
  disabled?: boolean;
  /** cash, liq, lock */
  value: IAllocation;
  onChange: (value: IAllocation) => void;
  classes?: string;
}

export type Boundary = [number, number];

const toBoundary = (val: IAllocation): Boundary => {
  return [val.cash, 100 - val.lock];
};

const toAlloc = ([b1, b2]: Boundary): IAllocation => {
  return {
    cash: b1,
    liq: b2 - b1,
    lock: 100 - b2,
  };
};

export function AllocationSlider({
  disabled = false,
  value,
  onChange,
  classes = "",
}: Props) {
  const boundary = toBoundary(value);

  return (
    <div
      className={`${classes} grid gap-y-4 border/80 p-4 rounded shadow-inner`}
    >
      {/** percentages */}
      <div className="grid grid-cols-[auto_auto_1fr_auto] gap-y-2">
        <Row
          title="Grant"
          icon={<HandCoins size={20} className="text-muted-fg" />}
          pct={value.cash}
        />
        <Row
          title="Savings"
          icon={<PiggyBank width={20} className="text-warning" />}
          pct={value.liq}
        />
        <Row
          title="Investment"
          icon={<Sprout className="text-success" size={20} />}
          pct={value.lock}
        />
      </div>

      {/** slider */}
      <Slider.Root
        value={boundary}
        minStepsBetweenValues={0}
        onValueChange={(b: Boundary) => onChange(toAlloc(b))}
        className="group/slider relative flex items-center select-none touch-none mt-2"
        disabled={disabled}
      >
        <Slider.Control className="flex w-full items-center">
          <Slider.Track
            style={{
              backgroundImage: `linear-gradient(to right, #F9FBFA 0%, #F9FBFA ${boundary[0]}%, #96C82D ${boundary[0]}%, #96C82D 100%)`,
            }}
            className="shadow-inner group-aria-disabled/slider:bg-[#f5e09d] relative grow rounded-full h-2"
          >
            <Slider.Indicator className="absolute bg-[#F5C828] group-aria-disabled/slider:bg-[#bdcc9d] rounded-full h-full" />
          </Slider.Track>
          <Slider.Thumb
            index={0}
            className="block size-5 rounded-full bg-muted-fg shadow-md  group-aria-disabled/slider:bg-muted-fg"
          />
          <Slider.Thumb
            index={1}
            className="block size-5 rounded-full bg-card shadow-md border group-aria-disabled/slider:bg-muted-fg"
          />
        </Slider.Control>
      </Slider.Root>
    </div>
  );
}

interface IRow {
  title: string;
  icon: ReactNode;
  pct: number;
}

function Row(props: IRow) {
  return (
    <div className="grid grid-cols-subgrid col-span-full items-center gap-x-1">
      {props.icon}
      <p className="text-sm ml-2">{props.title}</p>
      <p className="text-right mr-2">{props.pct}%</p>
    </div>
  );
}
