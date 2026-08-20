import { LoadingStatus } from "@better-giving/ui";

// LoadingStatus is the pending branch of query-loader: flex row with a spinning
// LoaderCircle. The spin is a CSS animation — a still capture shows one frame.

export const Default = () => (
  <div className="flex flex-col gap-4 items-start">
    <LoadingStatus>Loading..</LoadingStatus>
    <LoadingStatus>Loading requirements…</LoadingStatus>
    <LoadingStatus>Fetching payouts for Rainforest Trust</LoadingStatus>
  </div>
);

export const Sizes = () => (
  <div className="flex flex-col gap-4 items-start">
    <LoadingStatus classes="text-primary text-xs">
      Refreshing requirements..
    </LoadingStatus>
    <LoadingStatus classes="text-primary text-sm">
      Loading requirements…
    </LoadingStatus>
    <LoadingStatus classes="text-muted-fg">
      Verifying bank account
    </LoadingStatus>
  </div>
);

export const InPanel = () => (
  <div className="border rounded p-6 max-w-md">
    <h3 className="font-medium mb-1">Transfer requirements</h3>
    <p className="text-sm text-muted-fg mb-6">
      $1,200.00 · USD to Books for Kids
    </p>
    <LoadingStatus classes="text-primary text-sm">
      Loading requirements…
    </LoadingStatus>
  </div>
);
