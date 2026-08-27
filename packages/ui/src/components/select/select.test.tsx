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
