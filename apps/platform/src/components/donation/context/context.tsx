import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import type { State, StateSetter, TDonation } from "../types";

const INIT = "__INIT";
const context = createContext<State>(INIT as any);
export function Context({
  children,
  on_pay_busy,
  ...initState
}: PropsWithChildren<TDonation & { on_pay_busy?: (busy: boolean) => void }>) {
  const [state, set_state] = useState<TDonation>(initState);
  const on_pay_busy_ref = useRef(on_pay_busy);
  on_pay_busy_ref.current = on_pay_busy;
  const report_pay_busy = useCallback((busy: boolean) => {
    on_pay_busy_ref.current?.(busy);
  }, []);

  const don_set: StateSetter = (new_state) =>
    set_state((prev) =>
      typeof new_state === "function"
        ? new_state(prev)
        : { ...prev, ...new_state }
    );

  return (
    <context.Provider value={{ don: state, don_set, report_pay_busy }}>
      {children}
    </context.Provider>
  );
}

export function use_donation(): State {
  const val: any = useContext(context);
  if (val === INIT) {
    throw "use_donation can only be used in components inside Donation context";
  }

  return val;
}
