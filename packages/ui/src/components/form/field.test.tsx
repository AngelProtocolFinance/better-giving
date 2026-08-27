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

describe("Field: native validation", () => {
  it("renders a constrained text type as text, so the browser cannot block the submit in its own bubble", async () => {
    const screen = await render(
      <Field label="Work email" name="email" type="email" />
    );
    const input = screen.getByLabelText("Work email");

    await expect.element(input).toHaveAttribute("type", "text");
    await expect.element(input).toHaveAttribute("inputmode", "email");
    await expect.element(input).toHaveAttribute("autocapitalize", "none");
  });

  it("keeps a caller's own inputMode", async () => {
    const screen = await render(
      <Field label="Phone" name="phone" type="tel" inputMode="numeric" />
    );

    await expect
      .element(screen.getByLabelText("Phone"))
      .toHaveAttribute("inputmode", "numeric");
  });

  it("leaves a control type alone — date is the control, not a rule over free text", async () => {
    const screen = await render(
      <Field label="Start date" name="start" type="date" />
    );

    await expect
      .element(screen.getByLabelText("Start date"))
      .toHaveAttribute("type", "date");
  });

  it("withholds required from the control, and marks it on the label instead", async () => {
    const screen = await render(
      <Field label="Nonprofit name" name="o_name" required />
    );

    await expect
      .element(screen.getByLabelText("Nonprofit name"))
      .not.toHaveAttribute("required");
  });
});

describe("Field: error announcement", () => {
  // `aria-errormessage` is the right relationship and several screen readers
  // ignore it, so the description is what actually reaches the reader.
  it("names the message as the input's description", async () => {
    const screen = await render(
      <Field label="Work email" name="email" error="Enter a valid address" />
    );

    await expect
      .element(screen.getByLabelText("Work email"))
      .toHaveAccessibleDescription("Enter a valid address");
  });

  // conditional, so a valid field is not described by its own empty paragraph
  it("describes nothing when there is no error", async () => {
    const screen = await render(<Field label="Work email" name="email" />);

    await expect
      .element(screen.getByLabelText("Work email"))
      .toHaveAccessibleDescription("");
  });
});
