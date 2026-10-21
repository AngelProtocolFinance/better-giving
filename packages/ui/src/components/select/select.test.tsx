import { type FormEvent, useState } from "react";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { Select } from "./select";

const currencies = ["usd", "eur", "gbp"];

// zag's select puts `aria-invalid` on the trigger and nothing that says why,
// so the link to the message is ours to make.
describe("Select: error announcement", () => {
  test("names the message as the trigger's description", async () => {
    const screen = await render(
      <Select
        label="Currency"
        value={undefined}
        onChange={() => {}}
        options={currencies}
        option_disp={(o) => o.toUpperCase()}
        error="Pick a currency"
      />
    );

    await expect
      .element(screen.getByRole("combobox"))
      .toHaveAccessibleDescription("Pick a currency");
  });

  test("describes nothing when there is no error", async () => {
    const screen = await render(
      <Select
        label="Currency"
        value={undefined}
        onChange={() => {}}
        options={currencies}
        option_disp={(o) => o.toUpperCase()}
      />
    );

    await expect
      .element(screen.getByRole("combobox"))
      .toHaveAccessibleDescription("");
  });
});

describe("Select: compact trigger", () => {
  test("compact omits field-input; the default trigger keeps it", async () => {
    const screen = await render(
      <>
        <Select
          label="Currency"
          value={undefined}
          onChange={() => {}}
          options={currencies}
          option_disp={(o) => o.toUpperCase()}
        />
        <Select
          compact
          label="Compact currency"
          value={undefined}
          onChange={() => {}}
          options={currencies}
          option_disp={(o) => o.toUpperCase()}
        />
      </>
    );

    await expect
      .element(screen.getByRole("combobox", { name: "Currency", exact: true }))
      .toHaveClass("field-input");

    const compact = screen.getByRole("combobox", {
      name: "Compact currency",
      exact: true,
    });
    await expect.element(compact).not.toHaveClass("field-input");
    await expect
      .element(compact)
      .toHaveClass("selector-btn", "min-h-8", "py-1.5", "px-3", "text-sm");
  });
});

describe("Select: labelling", () => {
  test("the trigger is named by the label", async () => {
    const screen = await render(
      <Select
        label="Currency"
        value={undefined}
        onChange={() => {}}
        options={currencies}
        option_disp={(o) => o.toUpperCase()}
      />
    );

    await expect
      .element(screen.getByRole("combobox"))
      .toHaveAccessibleName("Currency");
  });

  // ark's `Select.Label` points `htmlFor` at the `HiddenSelect` this never
  // renders; a `<label>` whose `.control` is null names nothing
  test("renders no <label> pointing at a missing control", async () => {
    const screen = await render(
      <Select
        label="Currency"
        value={undefined}
        onChange={() => {}}
        options={currencies}
        option_disp={(o) => o.toUpperCase()}
      />
    );
    await expect.element(screen.getByRole("combobox")).toBeVisible();

    const orphaned = [
      ...screen.container.querySelectorAll<HTMLLabelElement>("label"),
    ].filter((l) => l.control == null);
    expect(orphaned.map((l) => l.outerHTML)).toEqual([]);
  });

  // the `.label` recipe's `::after` " *" is generated content, and accname
  // counts it through `aria-labelledby`
  test("a required Select's name carries the label's asterisk", async () => {
    const screen = await render(
      <Select
        label="Currency"
        required
        value={undefined}
        onChange={() => {}}
        options={currencies}
        option_disp={(o) => o.toUpperCase()}
      />
    );

    await expect
      .element(screen.getByRole("combobox"))
      .toHaveAccessibleName("Currency *");
  });

  test("clicking the label focuses the trigger", async () => {
    const screen = await render(
      <Select
        label="Currency"
        value={undefined}
        onChange={() => {}}
        options={currencies}
        option_disp={(o) => o.toUpperCase()}
      />
    );

    await screen.getByText("Currency", { exact: true }).click();

    await expect.element(screen.getByRole("combobox")).toHaveFocus();
  });

  test("a required, empty Select still reaches the submit handler", async () => {
    function RequiredForm() {
      const [error, set_error] = useState<string>();
      const on_submit = (e: FormEvent) => {
        e.preventDefault();
        set_error("Pick a currency");
      };
      return (
        <form onSubmit={on_submit}>
          <Select
            label="Currency"
            required
            value={undefined}
            onChange={() => {}}
            options={currencies}
            option_disp={(o) => o.toUpperCase()}
            error={error}
          />
          <button type="submit">Save</button>
        </form>
      );
    }
    const screen = await render(<RequiredForm />);

    await screen.getByRole("button", { name: "Save" }).click();

    await expect
      .element(screen.getByRole("combobox"))
      .toHaveAccessibleDescription("Pick a currency");
  });
});
