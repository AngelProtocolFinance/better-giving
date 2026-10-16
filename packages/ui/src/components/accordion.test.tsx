import { describe, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
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
  test.each(["compact", "divided", "tiles"] as const)(
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

  test.each([
    [undefined, 3],
    [4, 4],
  ] as const)(
    "heading_level %s: each trigger sits inside an h%i named by its question",
    async (heading_level, level) => {
      const screen = await render(
        <Accordion items={items} heading_level={heading_level} />
      );
      const heading = screen.getByRole("heading", {
        level,
        name: "Can I receive a tax receipt?",
      });
      await expect.element(heading).toBeVisible();
      await expect
        .element(
          heading.getByRole("button", { name: "Can I receive a tax receipt?" })
        )
        .toHaveAttribute("aria-expanded", "false");
      expect(screen.getByRole("heading", { level }).elements()).toHaveLength(
        items.length
      );
    }
  );
  test("tiles: each row is its own filled tile, spaced apart with no rule, and opens from the keyboard", async () => {
    const screen = await render(<Accordion items={items} variant="tiles" />);
    const trigger = screen.getByRole("button", {
      name: "Can I receive a tax receipt?",
    });
    const row = (name: string) =>
      (screen.getByRole("button", { name }).element() as HTMLElement).closest(
        "[data-part=item]"
      ) as HTMLElement;
    const first = row("Can I receive a tax receipt?");
    const second = row("How much does Better Giving charge?");
    const root = first.parentElement as HTMLElement;

    // no hairline anywhere: not the root's divide, not an edge on a row
    expect([...root.classList].filter((c) => c.startsWith("divide"))).toEqual(
      []
    );
    for (const el of [first, second]) {
      const style = getComputedStyle(el);
      expect(style.borderTopWidth).toBe("0px");
      expect(style.borderBottomWidth).toBe("0px");
      // the fill is the row's own, so a row reads as an object on any ground
      expect(style.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    }
    expect(
      second.getBoundingClientRect().top - first.getBoundingClientRect().bottom
    ).toBeGreaterThan(0);

    await userEvent.tab();
    await expect.element(trigger).toHaveFocus();
    expect(getComputedStyle(trigger.element()).outlineStyle).not.toBe("none");
    await userEvent.keyboard("{Enter}");
    await expect.element(trigger).toHaveAttribute("aria-expanded", "true");
    await expect
      .element(screen.getByText("We will email you a tax receipt."))
      .toBeVisible();
    // the answer opens inside its own tile
    expect(
      first.contains(
        screen.getByText("We will email you a tax receipt.").element()
      )
    ).toBe(true);
  });
});
