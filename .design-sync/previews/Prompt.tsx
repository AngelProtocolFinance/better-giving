import { Prompt } from "platform";

// Prompt is a full-screen modal over a backdrop — it is only meaningful in its
// open state, so every cell passes `open`. `onClose` is supplied so the default
// `navigate("..")` never runs inside the preview router.

export const Success = () => (
  <Prompt type="success" open onClose={() => {}}>
    <p className="text-lg font-medium text-fg">Payout requested</p>
    <p className="mt-2">
      $1,200.00 is on its way to your account ending 4821. Settlement usually
      completes within 3 business days.
    </p>
  </Prompt>
);

export const ErrorState = () => (
  <Prompt type="error" open onClose={() => {}}>
    <p className="text-lg font-medium text-fg">Bank details rejected</p>
    <p className="mt-2">
      The routing number doesn't match a US bank. Correct it and submit the
      banking application again.
    </p>
  </Prompt>
);

export const Loading = () => (
  <Prompt type="loading" open onClose={() => {}} isDismissable={false}>
    <p className="text-lg font-medium text-fg">Submitting your application</p>
    <p className="mt-2">This takes up to a minute. Don't close this window.</p>
  </Prompt>
);

// no `type` — the icon slot is empty and the prompt is pure copy, the shape
// used for review confirmations (routes/platform.applications_.$id.success).
export const NoIcon = () => (
  <Prompt open onClose={() => {}}>
    <p className="text-lg font-medium text-fg">Review submitted</p>
    <p className="mt-2">
      Rainforest Trust was approved on Nov 14, 2025 and is now live on the
      marketplace.
    </p>
  </Prompt>
);
