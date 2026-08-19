import { Confirmed } from "platform";

// Confirmed is the success twin of Info: inline CircleCheck + text-success text-sm.

export const Default = () => (
  <div className="flex flex-col gap-3 items-start">
    <Confirmed>Bank account verified</Confirmed>
    <Confirmed>Receipt sent to donor</Confirmed>
    <Confirmed>Your profile is visible in the marketplace</Confirmed>
    <Confirmed>Payout of $1,200.00 settled on Nov 14, 2025</Confirmed>
  </div>
);

export const PublishBanner = () => (
  <div className="flex flex-wrap justify-between items-center border border-success bg-success/10 rounded p-4 gap-4 max-w-lg">
    <Confirmed>Your fund is visible in the funds page</Confirmed>
    <button type="button" className="text-xs btn btn-primary px-4 py-2 rounded">
      Unpublish
    </button>
  </div>
);

export const InChecklist = () => (
  <div className="border rounded p-6 max-w-md">
    <h3 className="font-medium mb-4">Onboarding — Books for Kids</h3>
    <div className="flex flex-col gap-3 items-start">
      <Confirmed>EIN 87-3758939 matched to an IRS record</Confirmed>
      <Confirmed>Payout method added</Confirmed>
      <Confirmed>Donation form published</Confirmed>
    </div>
  </div>
);
