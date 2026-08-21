import { CheckField } from "@better-giving/ui";

export const Basic = () => (
  <CheckField name="fund_opt_in" classes="font-medium">
    Include this fundraiser in the Better Giving index
  </CheckField>
);

export const Checked = () => (
  <CheckField name="hide_bg_tip" defaultChecked classes="font-medium">
    Opt out of the support contribution model
  </CheckField>
);

export const Required = () => (
  <CheckField name="terms" required defaultChecked classes="font-medium">
    I confirm Rainforest Trust is a registered 501(c)(3)
  </CheckField>
);

export const WithError = () => (
  <CheckField name="donor_address_required" error="Select at least one option">
    Require donor address at checkout
  </CheckField>
);

export const Disabled = () => (
  <CheckField name="tribute_notif" disabled defaultChecked>
    Notify someone about this tribute
  </CheckField>
);

export const AlertPreferences = () => (
  <div className="flex flex-col gap-4">
    <CheckField name="alert_donation" defaultChecked classes="text-sm">
      Email me when a donation arrives
    </CheckField>
    <CheckField name="alert_banking" classes="text-sm">
      Email me when a payout is sent
    </CheckField>
  </div>
);
