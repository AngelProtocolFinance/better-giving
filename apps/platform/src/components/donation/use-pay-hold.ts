import { useEffect } from "react";
import { use_donation } from "./context";

/** the campaign dialog stays up while a payment's result is still unknown.
 * a mount that never passes `on_pay_busy` ignores the report. */
export function use_pay_hold(hold: boolean) {
  const { report_pay_busy } = use_donation();
  useEffect(() => {
    report_pay_busy?.(hold);
    return () => report_pay_busy?.(false);
  }, [hold, report_pay_busy]);
}
