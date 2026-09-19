import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { Accordion } from "./accordion";

const items = [
  {
    value: "receipt",
    trigger: "Can I receive a tax receipt?",
    content: <p>We will email you a tax receipt.</p>,
  },
  {
    value: "fees",
    trigger: "How much does Better Giving charge?",
    content: <p>It is free to set up and use.</p>,
  },
];

describe("Accordion", () => {
  test.each(["compact", "divided"] as const)(
    "%s: a trigger opens its content, and a second click collapses it",
    async (variant) => {
      const screen = await render(
        <Accordion items={items} variant={variant} />
      );
      const trigger = screen.getByRole("button", {
        name: "Can I receive a tax receipt?",
      });
      await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
      await expect
        .element(screen.getByText("We will email you a tax receipt."))
        .not.toBeVisible();

      await trigger.click();
      await expect.element(trigger).toHaveAttribute("aria-expanded", "true");
      await expect
        .element(screen.getByText("We will email you a tax receipt."))
        .toBeVisible();

      await trigger.click();
      await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
      await expect
        .element(screen.getByText("We will email you a tax receipt."))
        .not.toBeVisible();
    }
  );
});
