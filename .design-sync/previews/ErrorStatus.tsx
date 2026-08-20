import { ErrorStatus } from "@better-giving/ui";

// ErrorStatus is the failure branch of query-loader: flex row, CircleAlert, text-destructive.

export const Default = () => (
  <div className="flex flex-col gap-4 items-start">
    <ErrorStatus>Failed to get data</ErrorStatus>
    <ErrorStatus>We couldn't reach the payment processor</ErrorStatus>
    <ErrorStatus>This fundraiser is no longer accepting donations</ErrorStatus>
  </div>
);

export const Centered = () => (
  <div className="border rounded h-48 grid place-items-center max-w-md">
    <ErrorStatus classes="h-full items-center">Page not found</ErrorStatus>
  </div>
);

export const InCard = () => (
  <div className="border rounded p-6 max-w-md">
    <h3 className="font-medium mb-1">Payouts</h3>
    <p className="text-sm text-muted-fg mb-6">
      Rainforest Trust · last 30 days
    </p>
    <ErrorStatus classes="text-sm">
      We couldn't load your payout history. Refresh to try again.
    </ErrorStatus>
  </div>
);
