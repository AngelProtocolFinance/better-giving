import { PayoutStatus } from "platform";

// PayoutStatus is a dot + label chip keyed off the payout's `type`. Note two
// deliberate collapses in the component: `refunded_loss` renders as "Settled"
// (success) and `refunded` renders as "Refunded" (destructive).

export const AllTypes = () => (
  <div className="flex flex-col gap-3 items-start">
    <div className="flex items-center gap-3">
      <PayoutStatus type="pending" />
      <span className="text-xs text-muted-fg">type="pending"</span>
    </div>
    <div className="flex items-center gap-3">
      <PayoutStatus type="settled" />
      <span className="text-xs text-muted-fg">type="settled"</span>
    </div>
    <div className="flex items-center gap-3">
      <PayoutStatus type="refunded_loss" />
      <span className="text-xs text-muted-fg">
        type="refunded_loss" — reads as settled
      </span>
    </div>
    <div className="flex items-center gap-3">
      <PayoutStatus type="refunded" />
      <span className="text-xs text-muted-fg">type="refunded"</span>
    </div>
    <div className="flex items-center gap-3">
      <PayoutStatus type="error" />
      <span className="text-xs text-muted-fg">type="error"</span>
    </div>
    <div className="flex items-center gap-3">
      <PayoutStatus type="cancelled" />
      <span className="text-xs text-muted-fg">type="cancelled"</span>
    </div>
  </div>
);

export const InTable = () => (
  <table className="text-sm border-collapse max-w-xl">
    <thead>
      <tr className="text-left text-xs text-muted-fg">
        <th className="px-3 py-2 font-medium">Amount</th>
        <th className="px-3 py-2 font-medium">Description</th>
        <th className="px-3 py-2 font-medium">Date</th>
        <th className="px-3 py-2 font-medium">Status</th>
      </tr>
    </thead>
    <tbody>
      <tr className="border-t">
        <td className="px-3 py-2">$1,200.00</td>
        <td className="px-3 py-2">Rainforest Trust</td>
        <td className="px-3 py-2">Nov 14, 2025</td>
        <td className="px-3 py-2">
          <PayoutStatus type="settled" />
        </td>
      </tr>
      <tr className="border-t">
        <td className="px-3 py-2">$480.50</td>
        <td className="px-3 py-2">Ocean Conservancy</td>
        <td className="px-3 py-2">Nov 21, 2025</td>
        <td className="px-3 py-2">
          <PayoutStatus type="pending" />
        </td>
      </tr>
      <tr className="border-t">
        <td className="px-3 py-2">
          <span className="line-through text-destructive">$75.00</span>
        </td>
        <td className="px-3 py-2">Books for Kids</td>
        <td className="px-3 py-2">Oct 30, 2025</td>
        <td className="px-3 py-2">
          <PayoutStatus type="refunded" />
        </td>
      </tr>
      <tr className="border-t">
        <td className="px-3 py-2">$2,015.00</td>
        <td className="px-3 py-2">Rainforest Trust</td>
        <td className="px-3 py-2">Oct 15, 2025</td>
        <td className="px-3 py-2">
          <PayoutStatus type="error" />
        </td>
      </tr>
    </tbody>
  </table>
);

export const Inline = () => (
  <div className="border rounded p-4 max-w-md flex items-center justify-between gap-4">
    <div>
      <p className="font-medium">$1,200.00</p>
      <p className="text-sm text-muted-fg">Ocean Conservancy · Nov 14, 2025</p>
    </div>
    <PayoutStatus type="pending" classes="shrink-0" />
  </div>
);
