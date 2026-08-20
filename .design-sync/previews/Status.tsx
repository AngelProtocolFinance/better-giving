import { Status } from "@better-giving/ui";
import {
  Banknote,
  CircleAlert,
  CircleCheck,
  Clock,
  Landmark,
} from "lucide-react";

// Status is the base primitive the other status components wrap: it takes any
// node as `icon` and renders `icon + <span>{children}</span>`.

export const Default = () => (
  <div className="flex flex-col gap-3 items-start">
    <Status icon={<CircleCheck size={20} />}>
      Payout sent to Rainforest Trust
    </Status>
    <Status icon={<Clock size={20} />}>Next payout runs on Nov 14, 2025</Status>
    <Status icon={<Landmark size={20} />}>Bank account ending in 4471</Status>
  </div>
);

export const Inline = () => (
  <div className="max-w-md text-sm">
    <p>
      <Status
        inline
        icon={
          <CircleAlert
            size={16}
            className="mr-2 inline-block relative bottom-[2px]"
          />
        }
      >
        Fundraisers stay unlisted until Ocean Conservancy completes
        verification, so this text wraps around the icon instead of sitting in
        its own flex row.
      </Status>
    </p>
  </div>
);

export const Gaps = () => (
  <div className="flex flex-col gap-3 items-start">
    <Status gap="gap-1" icon={<Banknote size={20} />}>
      gap-1 — $1,200.00 to Books for Kids
    </Status>
    <Status gap="gap-2" icon={<Banknote size={20} />}>
      gap-2 (default) — $1,200.00 to Books for Kids
    </Status>
    <Status gap="gap-4" icon={<Banknote size={20} />}>
      gap-4 — $1,200.00 to Books for Kids
    </Status>
  </div>
);

export const Colored = () => (
  <div className="flex flex-col gap-3 items-start text-sm">
    <Status classes="text-success" icon={<CircleCheck size={20} />}>
      Settled on Nov 14, 2025
    </Status>
    <Status classes="text-destructive" icon={<CircleAlert size={20} />}>
      We couldn't reach the payment processor
    </Status>
    <Status classes="text-muted-fg" icon={<Clock size={20} />}>
      Awaiting bank confirmation
    </Status>
  </div>
);
