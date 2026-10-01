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
});
