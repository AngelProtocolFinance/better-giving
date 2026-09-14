import { describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { RadioGroup } from "./radio-group";

const items = [
  { value: "savings", label: "Savings account" },
  { value: "investments", label: "Investments account" },
  { value: "grant", label: "Grant", disabled: true },
];

describe("RadioGroup", () => {
  test("clicking an item checks it and hands its value", async () => {
    const on_change = vi.fn();
    const screen = await render(
      <RadioGroup
        label="Deposit to"
        items={items}
        defaultValue="savings"
        onValueChange={on_change}
      />
    );

    await screen.getByText("Investments account").click();

    await expect
      .element(screen.getByRole("radio", { name: "Investments account" }))
      .toBeChecked();
    await expect
      .element(screen.getByRole("radio", { name: "Savings account" }))
      .not.toBeChecked();
    expect(on_change).toHaveBeenCalledWith("investments");
  });

  test("arrow keys move the checked item", async () => {
    const screen = await render(
      <RadioGroup
        label="Deposit to"
        variant="tile"
        items={items.slice(0, 2)}
        defaultValue="savings"
      />
    );
    await screen.getByText("Savings account").click();

    await userEvent.keyboard("{ArrowDown}");
    await expect
      .element(screen.getByRole("radio", { name: "Investments account" }))
      .toBeChecked();

    await userEvent.keyboard("{ArrowUp}");
    await expect
      .element(screen.getByRole("radio", { name: "Savings account" }))
      .toBeChecked();
  });

  test("a disabled item can't be checked", async () => {
    const on_change = vi.fn();
    const screen = await render(
      <RadioGroup
        label="Deposit to"
        items={items}
        defaultValue="savings"
        onValueChange={on_change}
      />
    );

    await screen.getByText("Grant").click({ force: true });

    await expect
      .element(screen.getByRole("radio", { name: "Grant" }))
      .not.toBeChecked();
    await expect
      .element(screen.getByRole("radio", { name: "Savings account" }))
      .toBeChecked();
    expect(on_change).not.toHaveBeenCalled();
  });

  test("a tile's description is announced with its option", async () => {
    const screen = await render(
      <RadioGroup
        label="Allocation"
        variant="tile"
        items={[
          {
            value: "000-050-050",
            label: "Balanced Growth",
            description: "50% Savings, 50% Investment",
          },
        ]}
      />
    );

    await expect
      .element(screen.getByRole("radio", { name: "Balanced Growth" }))
      .toHaveAccessibleDescription("50% Savings, 50% Investment");
  });
});
