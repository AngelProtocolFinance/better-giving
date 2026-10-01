import { Field } from "@ark-ui/react/field";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { PasswordInput } from "./password-input";

describe("PasswordInput", () => {
  it("asks the password manager for the saved password by default", async () => {
    const screen = await render(
      <PasswordInput name="password" label="Password" />
    );

    await expect
      .element(screen.getByLabelText("Password", { exact: true }))
      .toHaveAttribute("autocomplete", "current-password");
  });

  // a reset or signup form wants the manager to offer a generated password,
  // not autofill the old one into both fields
  it("renders the autocomplete the caller passes", async () => {
    const screen = await render(
      <PasswordInput
        name="password"
        label="New password"
        autoComplete="new-password"
      />
    );

    await expect
      .element(screen.getByLabelText("New password", { exact: true }))
      .toHaveAttribute("autocomplete", "new-password");
  });

  it("describes the control by its error and marks it invalid", async () => {
    const screen = await render(
      <PasswordInput
        name="password"
        label="Password"
        error="Must contain at least 1 number"
      />
    );
    const input = screen.getByLabelText("Password", { exact: true });

    await expect.element(input).toHaveAttribute("aria-invalid", "true");
    await expect
      .element(input)
      .toHaveAccessibleDescription("Must contain at least 1 number");
  });

  it("carries no description and is not invalid without an error", async () => {
    const screen = await render(
      <PasswordInput name="password" label="Password" />
    );
    const input = screen.getByLabelText("Password", { exact: true });

    await expect.element(input).not.toHaveAttribute("aria-invalid", "true");
    await expect.element(input).not.toHaveAttribute("aria-describedby");
  });

  it("disables the visibility toggle on a disabled field", async () => {
    const screen = await render(
      <PasswordInput name="password" label="Password" disabled />
    );

    await expect
      .element(screen.getByLabelText("Password", { exact: true }))
      .toBeDisabled();
    await expect
      .element(screen.getByRole("button", { includeHidden: true }))
      .toBeDisabled();
  });

  it("puts a caller's id on the input and keeps the label and toggle on it", async () => {
    const screen = await render(
      <PasswordInput id="new-pw" name="password" label="Password" />
    );
    const input = screen.getByLabelText("Password", { exact: true });

    await expect.element(input).toHaveAttribute("id", "new-pw");
    await expect
      .element(screen.getByRole("button", { includeHidden: true }))
      .toHaveAttribute("aria-controls", "new-pw");
  });

  it("marks the label required on a required field", async () => {
    const screen = await render(
      <PasswordInput name="password" label="Password" required />
    );

    await expect
      .element(screen.getByText("Password", { exact: true }))
      .toHaveAttribute("data-required");
  });

  // without an error the component must not clobber the describedby an
  // enclosing Ark field links its helper text through
  it("keeps an enclosing field's description when it has no error", async () => {
    const screen = await render(
      <Field.Root>
        <PasswordInput name="password" label="Password" />
        <Field.HelperText>At least 8 characters</Field.HelperText>
      </Field.Root>
    );

    await expect
      .element(screen.getByLabelText("Password", { exact: true }))
      .toHaveAccessibleDescription("At least 8 characters");
  });

  it("keeps an enclosing field's invalid when it has no error", async () => {
    const screen = await render(
      <Field.Root invalid>
        <PasswordInput name="password" label="Password" />
      </Field.Root>
    );

    await expect
      .element(screen.getByLabelText("Password", { exact: true }))
      .toHaveAttribute("aria-invalid", "true");
  });
});
