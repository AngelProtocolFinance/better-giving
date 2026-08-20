import { Info } from "@better-giving/ui";

// Info is the app's empty-state / advisory line: inline CircleAlert + muted-fg text-sm.

export const Default = () => (
  <div className="flex flex-col gap-3 items-start">
    <Info>No fundraisers found</Info>
    <Info>You currently don't have any fundraisers</Info>
    <Info>No payout methods found</Info>
    <Info>No milestones</Info>
  </div>
);

export const EmptyTableState = () => (
  <div className="border rounded p-6 max-w-md">
    <h3 className="font-medium mb-1">Recurring donations</h3>
    <p className="text-sm text-muted-fg mb-4">
      Donors giving to Rainforest Trust on a schedule.
    </p>
    <Info classes="mt-6">No active recurring donations</Info>
  </div>
);

export const Warning = () => (
  <div className="border border-warning bg-warning/10 rounded p-4 max-w-md">
    <Info classes="text-warning">
      Your fundraiser is not visible in the funds page
    </Info>
  </div>
);

export const LongMessage = () => (
  <div className="max-w-md">
    <Info classes="text-sm">
      Target currency <span className="font-bold">PHP</span> is not supported.
      Please use a bank account with a different currency.
    </Info>
  </div>
);
