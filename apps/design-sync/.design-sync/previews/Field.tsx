import { Field } from "@better-giving/ui";

export const Text = () => (
  <Field
    name="org_name"
    label="Organization name"
    defaultValue="Rainforest Trust"
  />
);

export const Required = () => (
  <Field name="ein" label="EIN" required defaultValue="87-3758939" />
);

export const WithError = () => (
  <Field
    name="ein_bad"
    label="EIN"
    required
    defaultValue="8737"
    error="Must be 9 digits"
  />
);

export const WithSubAndTooltip = () => (
  <div className="flex flex-col gap-6">
    <Field
      name="payout_min"
      label="Minimum payout"
      sub="We hold funds until the balance clears this amount."
      defaultValue="50"
    />
    <Field
      name="slug"
      label="Fundraiser URL"
      tooltip="Lowercase letters, numbers and hyphens only."
      defaultValue="clean-water-2026"
    />
  </div>
);

export const TextArea = () => (
  <Field
    type="textarea"
    name="mission"
    label="Mission statement"
    rows={4}
    defaultValue="We protect threatened tropical forests by purchasing and protecting the land outright, in partnership with local communities."
  />
);

export const Disabled = () => (
  <Field name="ein_locked" label="EIN" disabled defaultValue="87-3758939" />
);
