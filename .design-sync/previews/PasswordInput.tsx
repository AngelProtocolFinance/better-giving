import { PasswordInput } from "@better-giving/ui";

export const Basic = () => (
  <PasswordInput name="password" placeholder="Password" />
);

export const Filled = () => (
  <PasswordInput name="password" defaultValue="rainforest-2026" />
);

export const WithError = () => (
  <PasswordInput
    name="password"
    defaultValue="rainforest"
    error="Must contain at least 1 number"
  />
);

export const Disabled = () => (
  <PasswordInput name="password" disabled placeholder="Password" />
);

export const SetPasswordForm = () => (
  <div className="flex flex-col gap-3">
    <PasswordInput name="password" placeholder="New password" />
    <PasswordInput
      name="password_confirmation"
      placeholder="Confirm new password"
      error="Passwords do not match"
    />
  </div>
);
