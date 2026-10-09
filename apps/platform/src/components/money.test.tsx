import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { Money } from "./money";

describe("Money", () => {
  test("prints a fiat figure at its minor units", async () => {
    const screen = await render(
      <Money amount={25.99} amount_usd={18.97} currency="CAD" />
    );
    await expect.element(screen.getByText("25.99")).toBeVisible();
  });

  test("rounds a fiat figure up, not down to cents like a plain number", async () => {
    const screen = await render(
      <Money amount={500.501} amount_usd={25.03} currency="MXN" />
    );
    await expect.element(screen.getByText("500.51")).toBeVisible();
  });

  test("keeps a crypto token's decimals", async () => {
    const screen = await render(
      <Money amount={0.0050001} amount_usd={600} currency="BTC" />
    );
    await expect.element(screen.getByText("0.0050001")).toBeVisible();
  });

  test("without a usd value falls back to a plain two-decimal number", async () => {
    const screen = await render(<Money amount={500.501} currency="MXN" />);
    await expect.element(screen.getByText("500.50")).toBeVisible();
  });
});
