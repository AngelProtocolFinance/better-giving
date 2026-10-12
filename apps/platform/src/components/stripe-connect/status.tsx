import { ExtLink } from "@better-giving/ui";
import { SquareArrowOutUpRight } from "lucide-react";

export type TConnectStatus =
  | "not_connected"
  | "incomplete"
  | "pending"
  | "ready";

interface ITone {
  label: string;
  ink: string;
  dot: string;
}

// ink is each ramp's legible step, never its step-9 fill (design-system.md);
// the dot is a fill, so it takes step 9.
const tones: Record<TConnectStatus, ITone> = {
  not_connected: {
    label: "Not connected",
    ink: "text-gray-11",
    dot: "bg-gray-11",
  },
  incomplete: {
    label: "Finish setup on Stripe",
    ink: "text-warning-subtle-fg",
    dot: "bg-warning",
  },
  pending: {
    label: "Pending review",
    ink: "text-warning-subtle-fg",
    dot: "bg-warning",
  },
  ready: {
    label: "Ready to receive card donations",
    ink: "text-success-subtle-fg",
    dot: "bg-success",
  },
};

export interface IStripeConnectStatus {
  status: TConnectStatus;
  /** outer placement only — margin, self-alignment */
  classes?: string;
}

/** where a nonprofit's Stripe account stands. never shows a balance — that is
 *  Stripe's to show, behind the dashboard link. */
export function StripeConnectStatus({
  status,
  classes = "",
}: IStripeConnectStatus) {
  const tone = tones[status];
  return (
    <p
      className={`${classes} flex flex-wrap items-center gap-x-4 gap-y-1 text-sm`}
    >
      <span
        className={`inline-flex items-center gap-2 font-medium ${tone.ink}`}
      >
        <span
          aria-hidden
          className={`size-2 shrink-0 rounded-full ${tone.dot}`}
        />
        {tone.label}
      </span>
      {status !== "not_connected" && (
        <ExtLink
          href="https://dashboard.stripe.com/"
          className="inline-flex items-center gap-1 link"
        >
          <span>Stripe dashboard</span>
          <SquareArrowOutUpRight aria-hidden className="icon-sm" />
        </ExtLink>
      )}
    </p>
  );
}
