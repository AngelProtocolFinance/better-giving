import { useState } from "react";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { TDonateMethod } from "#/types/components";
import { DonateMethods } from "./donate-methods";

const methods = (): TDonateMethod[] => [
  { id: "stripe", name: "Card", disabled: false },
  { id: "crypto", name: "Crypto", disabled: false },
  { id: "stocks", name: "Stocks", disabled: false },
  { id: "daf", name: "DAF", disabled: true },
];

/** controlled wrapper — mirrors how consumers use this component */
function Harness({ initial }: { initial: TDonateMethod[] }) {
  const [values, set_values] = useState(initial);
  return (
    <div>
      <DonateMethods values={values} on_change={set_values} />
      <div data-testid="order">{values.map((v) => v.name).join(",")}</div>
    </div>
  );
}

const grip = (name: string) => new RegExp(`^reorder ${name},`, "i");

describe("DonateMethods — keyboard reorder", () => {
  it("moves a method down and keeps focus on its grip", async () => {
    const screen = await render(<Harness initial={methods()} />);

    const order = screen.getByTestId("order");
    await expect.element(order).toHaveTextContent("Card,Crypto,Stocks,DAF");

    const card = screen.getByRole("button", { name: grip("Card") });
    (card.element() as HTMLElement).focus();
    await userEvent.keyboard("{ArrowDown}");

    await expect.element(order).toHaveTextContent("Crypto,Card,Stocks,DAF");

    // press-arrow-repeatedly is the whole interaction, so focus has to survive
    // the move
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: grip("Card") }).element()
    );

    // the name carries the new position, and the move is announced
    await expect
      .element(
        screen.getByRole("button", { name: /^reorder card, position 2 of 4$/i })
      )
      .toBeVisible();
    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("Card moved to position 2 of 4");
  });

  it("moves a method up", async () => {
    const screen = await render(<Harness initial={methods()} />);

    const crypto = screen.getByRole("button", { name: grip("Crypto") });
    (crypto.element() as HTMLElement).focus();
    await userEvent.keyboard("{ArrowUp}");

    await expect
      .element(screen.getByTestId("order"))
      .toHaveTextContent("Crypto,Card,Stocks,DAF");
  });

  it("ignores the arrow key at the end it is moving toward", async () => {
    const screen = await render(<Harness initial={methods()} />);

    const card = screen.getByRole("button", { name: grip("Card") });
    (card.element() as HTMLElement).focus();
    await userEvent.keyboard("{ArrowUp}");

    await expect
      .element(screen.getByTestId("order"))
      .toHaveTextContent("Card,Crypto,Stocks,DAF");
    // nothing moved, so nothing is announced
    expect(screen.getByRole("status").element().textContent).toBe("");
  });

  it("labels each checkbox with its method name", async () => {
    const screen = await render(<Harness initial={methods()} />);

    await expect
      .element(screen.getByLabelText("Card", { exact: true }))
      .toBeChecked();
    await expect
      .element(screen.getByLabelText("DAF", { exact: true }))
      .not.toBeChecked();

    await screen.getByLabelText("Card", { exact: true }).click();
    await expect
      .element(screen.getByLabelText("Card", { exact: true }))
      .not.toBeChecked();
  });
});
