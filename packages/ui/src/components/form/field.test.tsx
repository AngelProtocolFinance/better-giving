import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Field } from "./field";

describe("Field: autofill", () => {
  it("defaults to off — the visitor's saved values must not prefill somebody else's data", async () => {
    const screen = await render(
      <Field label="Organization name" name="npo_name" />
    );
    const input = screen.getByLabelText("Organization name");

    await expect.element(input).toHaveAttribute("autocomplete", "off");
  });

  it("passes a named token through, so a field can opt into autofill", async () => {
    const screen = await render(
      <Field
        label="Your employer"
        name="company_name"
        autoComplete="organization"
      />
    );
    const input = screen.getByLabelText("Your employer");

    await expect.element(input).toHaveAttribute("autocomplete", "organization");
  });

  it("applies to a textarea too", async () => {
    const screen = await render(
      <Field label="Notes" name="notes" type="textarea" autoComplete="off" />
    );

    await expect
      .element(screen.getByLabelText("Notes"))
      .toHaveAttribute("autocomplete", "off");
  });
});
