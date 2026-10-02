import { CircleHelp } from "lucide-react";
import { describe, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { popup_shell } from "./popup";
import { RadioGroup } from "./radio-group";
import { Arrow, Content, Tooltip } from "./tooltip";

describe("Tooltip", () => {
  test("Content carries the shell, and the caller's classes ride after it", async () => {
    const screen = await render(
      <Tooltip tip={<Content className="max-w-xs text-xs">a tip</Content>}>
        <button type="button">trigger</button>
      </Tooltip>
    );
    await screen.getByRole("button", { name: "trigger" }).click();
    // portaled, so looked up on the page rather than the render container
    const body = page.getByText("a tip");
    await expect.element(body).toBeVisible();
    const cls = body.element().className.split(/\s+/);
    for (const c of popup_shell.split(" ")) expect(cls).toContain(c);
    expect(cls).toContain("max-w-xs");
    expect(cls).toContain("text-xs");
  });

  test("a bare glyph is reachable by Tab, named by the tip, and opens it on focus", async () => {
    const screen = await render(
      <p>
        Revenue{" "}
        <Tooltip
          tip={
            <Content className="text-xs">
              <Arrow />
              Refunded
            </Content>
          }
        >
          <CircleHelp className="inline icon-sm" />
        </Tooltip>
      </p>
    );
    await userEvent.tab();
    const trigger = screen.getByRole("button", { name: "Refunded" });
    await expect.element(trigger).toHaveFocus();
    await expect.element(trigger).toHaveAccessibleName("Refunded");
    // named by the tip, so the open tip is not read again as a description
    await expect.element(trigger).not.toHaveAccessibleDescription();
    await expect
      .element(page.getByRole("tooltip"))
      .toHaveTextContent("Refunded");
    // the ring is drawn on the glyph, since the button may have no box of its own
    const glyph = trigger.element().querySelector("svg") as SVGElement;
    expect(getComputedStyle(glyph).outlineStyle).toBe("solid");
  });

  test("a glyph with visible text keeps that text first in its name", async () => {
    const screen = await render(
      <Tooltip tip={<Content>Tip to Better Giving</Content>}>
        <span>+$12.00</span>
      </Tooltip>
    );
    await expect
      .element(screen.getByRole("button"))
      .toHaveAccessibleName("+$12.00 Tip to Better Giving");
  });

  test("a button child is the trigger itself: exactly one button", async () => {
    const screen = await render(
      <Tooltip tip={<Content>a tip</Content>}>
        <button type="button" aria-label="Add to favorites">
          <CircleHelp className="icon-sm" />
        </button>
      </Tooltip>
    );
    expect(screen.container.querySelectorAll("button")).toHaveLength(1);
    await expect
      .element(screen.getByRole("button"))
      .toHaveAccessibleName("Add to favorites");
  });

  test("inside a radio's label, clicking the trigger does not check the radio", async () => {
    const screen = await render(
      <RadioGroup
        label="Goal"
        defaultValue="none"
        items={[
          {
            value: "smart",
            label: (
              <>
                Use smart milestones{" "}
                <Tooltip tip={<Content>Grows with your success</Content>}>
                  <CircleHelp className="inline icon-sm" />
                </Tooltip>
              </>
            ),
          },
          { value: "none", label: "No goal" },
        ]}
      />
    );
    const smart = screen.getByRole("radio", { name: "Use smart milestones" });
    // the tip's copy stays out of the radio's own name
    await expect.element(smart).toHaveAccessibleName("Use smart milestones");
    await expect.element(smart).not.toBeChecked();
    await screen
      .getByRole("button", { name: "Grows with your success" })
      .click();
    await expect.element(page.getByRole("tooltip")).toBeVisible();
    await expect.element(smart).not.toBeChecked();
    await screen.getByText("Use smart milestones").click();
    await expect.element(smart).toBeChecked();
  });
});
