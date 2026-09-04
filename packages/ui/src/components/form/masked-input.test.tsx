import { useState } from "react";
import { useController, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { MaskedInput } from "./masked-input";
import { dollar, ein } from "./masks";

/** controlled wrapper — mirrors how consumers use this component */
function Harness({
  initial = 0,
  disabled,
}: {
  initial?: number;
  disabled?: boolean;
}) {
  const [amount, set_amount] = useState(initial);
  return (
    <div>
      <MaskedInput
        id="amount"
        label="Amount"
        mask={dollar}
        disabled={disabled}
        value={dollar.mask(amount)}
        onChange={(v) => set_amount(+dollar.unmask(v))}
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
        mask={dollar}
        value={dollar.mask(value)}
        onChange={(v) => onChange(+dollar.unmask(v))}
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
    await expect.element(screen.getByTestId("raw")).toMatchTextContent("12345");
  });

  it("strips non-numeric characters", async () => {
    const screen = await render(<Harness />);
    const input = screen.getByLabelText("Amount");

    await input.tripleClick();
    await userEvent.type(input.element() as HTMLElement, "5abc00");

    await expect.element(input).toHaveValue("$ 500");
    await expect.element(screen.getByTestId("raw")).toMatchTextContent("500");
  });

  it("handles clearing to empty then typing fresh value", async () => {
    const screen = await render(<Harness initial={1000} />);
    const input = screen.getByLabelText("Amount");

    await expect.element(input).toHaveValue("$ 1,000");

    // select all and replace
    await input.tripleClick();
    await userEvent.type(input.element() as HTMLElement, "42");

    await expect.element(input).toHaveValue("$ 42");
    await expect.element(screen.getByTestId("raw")).toMatchTextContent("42");
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
        mask={dollar}
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
      .toMatchTextContent("7500");
  });

  it("works with react-hook-form: preserves default value", async () => {
    const screen = await render(<RHFHarness default_value={25000} />);
    const input = screen.getByLabelText("Donation");

    await expect.element(input).toHaveValue("$ 25,000");

    await screen.getByRole("button", { name: /submit/i }).click();

    await expect
      .element(screen.getByTestId("submitted"))
      .toMatchTextContent("25000");
  });

  it("forwards ref to the input element", async () => {
    const ref_spy = vi.fn();
    await render(
      <MaskedInput
        id="ref-test"
        label="Amount"
        mask={dollar}
        value="$ 0"
        onChange={() => {}}
        ref={ref_spy}
      />
    );

    expect(ref_spy).toHaveBeenCalledWith(expect.any(HTMLInputElement));
  });
});

/** the ein field keeps the masked string in state — the schema strips the dash */
function EinHarness({ initial = "" }: { initial?: string }) {
  const [val, set_val] = useState(initial);
  return (
    <div>
      <MaskedInput
        id="ein"
        label="EIN"
        mask={ein}
        value={ein.format(val)}
        onChange={set_val}
      />
      <output data-testid="raw">{val}</output>
    </div>
  );
}

describe("MaskedInput: ein mask", () => {
  it("dashes typed digits after the second", async () => {
    const screen = await render(<EinHarness />);
    const input = screen.getByLabelText("EIN");

    await userEvent.type(input.element() as HTMLElement, "12");
    await expect.element(input).toHaveValue("12");

    await userEvent.type(input.element() as HTMLElement, "3");
    await expect.element(input).toHaveValue("12-3");

    await userEvent.type(input.element() as HTMLElement, "456789");
    await expect.element(input).toHaveValue("12-3456789");
    await expect
      .element(screen.getByTestId("raw"))
      .toMatchTextContent("12-3456789");
  });

  it("stops at nine digits", async () => {
    const screen = await render(<EinHarness />);
    const input = screen.getByLabelText("EIN");

    await input.fill("123456789012");

    await expect.element(input).toHaveValue("12-3456789");
    await expect
      .element(screen.getByTestId("raw"))
      .toMatchTextContent("12-3456789");
  });

  it("keeps an already-dashed value pasted in whole", async () => {
    const screen = await render(<EinHarness />);
    const input = screen.getByLabelText("EIN");

    await input.fill("12-3456789");

    await expect.element(input).toHaveValue("12-3456789");
    await expect
      .element(screen.getByTestId("raw"))
      .toMatchTextContent("12-3456789");
  });

  it("renders a stored bare-digit ein dashed", async () => {
    const screen = await render(<EinHarness initial="123456789" />);
    await expect
      .element(screen.getByLabelText("EIN"))
      .toHaveValue("12-3456789");
  });
});

/** react-hook-form wrapper that subscribes to `touchedFields` */
function BlurHarness() {
  const {
    control,
    formState: { touchedFields },
  } = useForm({ defaultValues: { ein: "" } });
  const { field } = useController({ name: "ein", control });

  return (
    <div>
      <MaskedInput
        id="blur-ein"
        label="EIN"
        ref={field.ref}
        mask={ein}
        value={ein.format(field.value)}
        onChange={field.onChange}
        onBlur={field.onBlur}
      />
      <output data-testid="touched">{touchedFields.ein ? "yes" : "no"}</output>
    </div>
  );
}

describe("MaskedInput: disabled", () => {
  it("refuses typing while disabled", async () => {
    const screen = await render(<Harness initial={1000} disabled />);
    const input = screen.getByLabelText("Amount");

    // focus rather than click: the caller's disabled affordance is
    // pointer-events:none, so a pointer would never reach the field anyway
    (input.element() as HTMLElement).focus();
    await userEvent.keyboard("42");

    await expect.element(input).toHaveValue("$ 1,000");
    await expect.element(screen.getByTestId("raw")).toMatchTextContent("1000");
  });

  it("still submits its value while disabled", async () => {
    const posted: { fd?: FormData } = {};
    const screen = await render(
      <form
        onSubmit={(e) => {
          e.preventDefault();
          posted.fd = new FormData(e.currentTarget);
        }}
      >
        <MaskedInput
          id="disabled-ein"
          name="o_ein"
          label="EIN"
          mask={ein}
          value={ein.format("123456789")}
          onChange={() => {}}
          disabled
        />
        <button type="submit">Submit</button>
      </form>
    );

    await screen.getByRole("button", { name: /submit/i }).click();

    await vi.waitFor(() => expect(posted.fd?.get("o_ein")).toBe("12-3456789"));
  });

  it("marks the field touched on blur", async () => {
    const screen = await render(<BlurHarness />);
    const input = screen.getByLabelText("EIN");

    await expect
      .element(screen.getByTestId("touched"))
      .toMatchTextContent("no");

    const el = input.element() as HTMLElement;
    el.focus();
    el.blur();

    await expect
      .element(screen.getByTestId("touched"))
      .toMatchTextContent("yes");
  });
});

describe("MaskedInput: error announcement", () => {
  // `aria-errormessage` is the right relationship and several screen readers
  // ignore it, so the description is what actually reaches the reader.
  it("names the message as the input's description", async () => {
    const screen = await render(
      <MaskedInput
        id="ein"
        label="EIN"
        mask={ein}
        value=""
        onChange={() => {}}
        error="Enter a valid EIN"
      />
    );

    await expect
      .element(screen.getByLabelText("EIN"))
      .toHaveAccessibleDescription("Enter a valid EIN");
  });

  // conditional, so a valid field is not described by its own empty paragraph
  it("describes nothing when there is no error", async () => {
    const screen = await render(
      <MaskedInput
        id="ein"
        label="EIN"
        mask={ein}
        value=""
        onChange={() => {}}
      />
    );

    await expect
      .element(screen.getByLabelText("EIN"))
      .toHaveAccessibleDescription("");
  });
});
