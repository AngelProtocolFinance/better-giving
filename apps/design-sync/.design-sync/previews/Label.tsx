import { Label } from "@better-giving/ui";

export const Basic = () => (
  <Label htmlFor="payout_bank">Bank account for payouts</Label>
);

export const Required = () => (
  <Label htmlFor="ein" required>
    Employer Identification Number (EIN)
  </Label>
);

export const Optional = () => (
  <Label htmlFor="tagline" required={false}>
    Tagline
  </Label>
);

export const WithControl = () => (
  <div className="flex flex-col gap-6">
    <div>
      <Label htmlFor="org_name" required className="mb-2">
        Organization name
      </Label>
      <input
        id="org_name"
        readOnly
        className="field-input"
        defaultValue="Ocean Conservancy"
      />
    </div>
    <div>
      <Label htmlFor="program_note" required={false} className="mb-2">
        Note to donors
      </Label>
      <input
        id="program_note"
        readOnly
        className="field-input"
        placeholder="Thank you for protecting the coast"
      />
    </div>
  </div>
);
