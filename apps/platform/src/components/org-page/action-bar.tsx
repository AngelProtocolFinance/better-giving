import type { ReactNode } from "react";

/** padding for the last element in flow (the footer), so it scrolls clear of
 * the bar: the bar's own height (py-3 + a 52px btn-lg + the border) plus room
 * for the footer's last tap target */
export const ACTION_BAR_CLEARANCE = "max-lg:pb-28";

interface IActionBar {
  children: ReactNode;
}

/** on a phone the page's action column folds into the flow, so its actions
 * pin to the bottom edge. pair it with `ACTION_BAR_CLEARANCE` on the footer */
export function ActionBar({ children }: IActionBar) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-sticky flex items-center gap-2 border-t bg-panel px-4 py-3 lg:hidden">
      {children}
    </div>
  );
}
