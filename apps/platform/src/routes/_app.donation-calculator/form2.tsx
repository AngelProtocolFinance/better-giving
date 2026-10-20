import type { OgInput } from "#/types/donation-calculator";
import { PctSlider } from "./pct-slider";

interface Props {
  classes?: string;
  state: OgInput;
  setState: (x: OgInput) => void;
}

export function Form2({ classes = "", state, setState }: Props) {
  return (
    <div className={`${classes} p-6`}>
      <h2 className="text-xl mb-2">Projected Savings & Investment</h2>

      <PctSlider
        range={[0, 1]}
        label="Percentage to allocate towards savings/investments"
        value={+state.notGrantedRate}
        onChange={(x) => setState({ ...state, notGrantedRate: x })}
        tooltip="Select the percentage of donations you would consider allocating towards savings and investments if it were handled effortlessly on your behalf."
      />
      <p className="text-sm text-gray-11 mt-1">
        Better Giving automates this process completely, handling allocations
        and investment management.
      </p>

      <p className="font-semibold text-lg mt-6 text-primary">
        Allocation between accounts
      </p>
      <PctSlider
        range={[0, 1]}
        label="Savings account (3.4% variable interest rate, illustrative example)"
        classes="mt-2"
        value={1 - +state.investRate}
        onChange={(x) => setState({ ...state, investRate: 1 - x })}
        tooltip="Illustrative example. Returns vary, and past performance isn't a guarantee."
      />
      <PctSlider
        range={[0, 1]}
        label="Sustainability Fund (11% avg. return, illustrative example)"
        classes="mt-2"
        value={+state.investRate}
        onChange={(x) => setState({ ...state, investRate: x })}
        tooltip="Illustrative example. Returns vary, and past performance isn't a guarantee."
      />
    </div>
  );
}
