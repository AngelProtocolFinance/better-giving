import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Usd } from "./usd";

// the details block's figures are gains when positive, so polarity is inferred
// from the arithmetic sign. `cost` is the escape hatch for the first row that
// is genuinely money leaving — without it such a row renders green with a `+`.
describe("Usd polarity", () => {
  it("paints a positive figure as a gain, with the sign prefix", async () => {
    const screen = await render(<Usd sign>{240}</Usd>);
    const el = screen.getByText(/^\+\$240$/);
    await expect.element(el).toHaveClass(/text-success-subtle-fg/);
  });

  it("paints the same figure as a loss under `cost`, unprefixed", async () => {
    const screen = await render(
      <Usd sign cost>
        {240}
      </Usd>
    );
    const el = screen.getByText(/^\$240$/);
    await expect.element(el).toHaveClass(/text-destructive-subtle-fg/);
  });

  it("paints a cost that shrinks as the gain", async () => {
    const screen = await render(
      <Usd sign cost>
        {-240}
      </Usd>
    );
    const el = screen.getByText(/240/);
    await expect.element(el).toHaveClass(/text-success-subtle-fg/);
  });
});
