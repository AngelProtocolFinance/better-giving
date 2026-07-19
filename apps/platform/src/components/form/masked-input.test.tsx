import { useState } from "react";
import { useController, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { MaskedInput } from "./masked-input";
import { mask, unmask } from "./masks/dollar";

/** controlled wrapper — mirrors how consumers use this component */
function Harness({ initial = 0 }: { initial?: number }) {
  const [amount, set_amount] = useState(initial);
  return (
    <div>
      <MaskedInput
        id="amount"
        label="Amount"
        value={mask(amount)}
        onChange={(v) => set_amount(+unmask(v))}
      />
      <output data-testid="raw">{amount}</output>
    </div>
  );
}

/** react-hook-form wrapper */
function RHFHarness({ default_value = 0 }: { default_value?: number }) {
  const { control, handleSubmit } = useForm({
    defaultValues: { amount: default_value },
  });
  const {
    field: { value, onChange, ref },
  } = useController({ name: "amount", control });
  const [submitted, set_submitted] = useState<number | null>(null);

  return (
    <form
      onSubmit={handleSubmit((data) => set_submitted(data.amount))}
      data-testid="form"
    >
      <MaskedInput
        id="rhf-amount"
        label="Donation"
        ref={ref}
        value={mask(value)}
        onChange={(v) => onChange(+unmask(v))}
      />
      <button type="submit">Submit</button>
      {submitted !== null && (
        <output data-testid="submitted">{submitted}</output>
      )}
    </form>
  );
}

describe("MaskedInput", () => {
  it("formats typed digits as dollar amount and updates raw state", async () => {
    const screen = await render(<Harness />);
    const input = screen.getByLabelText("Amount");

    // initial value
    await expect.element(input).toHaveValue("$ 0");

    // select all and type a number
    await input.tripleClick();
    await userEvent.type(input.element() as HTMLElement, "12345");

    await expect.element(input).toHaveValue("$ 12,345");
    await expect.element(screen.getByTestId("raw")).toHaveTextContent("12345");
  });

  it("strips non-numeric characters", async () => {
    const screen = await render(<Harness />);
    const input = screen.getByLabelText("Amount");

    await input.tripleClick();
    await userEvent.type(input.element() as HTMLElement, "5abc00");

    await expect.element(input).toHaveValue("$ 500");
    await expect.element(screen.getByTestId("raw")).toHaveTextContent("500");
  });

  it("handles clearing to empty then typing fresh value", async () => {
    const screen = await render(<Harness initial={1000} />);
    const input = screen.getByLabelText("Amount");

    await expect.element(input).toHaveValue("$ 1,000");

    // select all and replace
    await input.tripleClick();
    await userEvent.type(input.element() as HTMLElement, "42");

    await expect.element(input).toHaveValue("$ 42");
    await expect.element(screen.getByTestId("raw")).toHaveTextContent("42");
  });

  it("formats large numbers with thousand separators", async () => {
    const screen = await render(<Harness />);
    const input = screen.getByLabelText("Amount");

    await input.tripleClick();
    await userEvent.type(input.element() as HTMLElement, "5000000");

    await expect.element(input).toHaveValue("$ 5,000,000");
  });

  it("renders error state with aria attributes", async () => {
    const screen = await render(
      <MaskedInput
        id="err-test"
        label="Amount"
        value="$ 0"
        onChange={() => {}}
        error="Required"
      />
    );

    const input = screen.getByLabelText("Amount");
    await expect.element(input).toHaveAttribute("aria-invalid", "true");
    await expect.element(screen.getByText("Required")).toBeVisible();
  });

  it("works with react-hook-form: type, submit, and get correct numeric value", async () => {
    const screen = await render(<RHFHarness />);
    const input = screen.getByLabelText("Donation");

    await input.tripleClick();
    await userEvent.type(input.element() as HTMLElement, "7500");

    await expect.element(input).toHaveValue("$ 7,500");

    await screen.getByRole("button", { name: /submit/i }).click();

    await expect
      .element(screen.getByTestId("submitted"))
      .toHaveTextContent("7500");
  });

  it("works with react-hook-form: preserves default value", async () => {
    const screen = await render(<RHFHarness default_value={25000} />);
    const input = screen.getByLabelText("Donation");

    await expect.element(input).toHaveValue("$ 25,000");

    await screen.getByRole("button", { name: /submit/i }).click();

    await expect
      .element(screen.getByTestId("submitted"))
      .toHaveTextContent("25000");
  });

  it("forwards ref to the input element", async () => {
    const ref_spy = vi.fn();
    await render(
      <MaskedInput
        id="ref-test"
        label="Amount"
        value="$ 0"
        onChange={() => {}}
        ref={ref_spy}
      />
    );

    expect(ref_spy).toHaveBeenCalledWith(expect.any(HTMLInputElement));
  });
});
