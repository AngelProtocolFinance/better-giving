import { CircleHelp } from "lucide-react";
import type { ComponentProps } from "react";
import { describe, expect, test, vi } from "vitest";
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

  test("a bare glyph is reachable by Tab, named More info, described by the tip, and opens it on focus", async () => {
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
    const trigger = screen.getByRole("button", { name: "More info" });
    await expect.element(trigger).toHaveFocus();
    await expect.element(trigger).toHaveAccessibleName("More info");
    // described by the tip's text, whether or not it is open
    await expect.element(trigger).toHaveAccessibleDescription("Refunded");
    await expect
      .element(page.getByRole("tooltip"))
      .toHaveTextContent("Refunded");
    // the ring is drawn on the glyph, since the button may have no box of its own
    const glyph = trigger.element().querySelector("svg") as SVGElement;
    expect(getComputedStyle(glyph).outlineStyle).toBe("solid");
  });

  test("the description is the tip's text, not its components or icons", async () => {
    const screen = await render(
      <Tooltip
        tip={
          <Content>
            <p>
              Base fee <span>1.5%</span>
            </p>
            <p>
              covered by donor
              <CircleHelp className="inline icon-xs" />
            </p>
            <Arrow />
          </Content>
        }
      >
        <CircleHelp className="icon-sm" />
      </Tooltip>
    );
    const trigger = screen.getByRole("button");
    await expect
      .element(trigger)
      .toHaveAccessibleDescription("Base fee 1.5% covered by donor");
    // the copy holds text alone, so nothing from the tip is rendered twice
    const copy = document.getElementById(
      trigger.element().getAttribute("aria-describedby") ?? ""
    );
    expect(copy?.children).toHaveLength(0);
  });

  test("a glyph with visible text is named by that text alone", async () => {
    const screen = await render(
      <Tooltip tip={<Content>Tip to Better Giving</Content>}>
        <span>+${"12.00"}</span>
      </Tooltip>
    );
    const trigger = screen.getByRole("button");
    await expect.element(trigger).toHaveAccessibleName("+$12.00");
    await expect
      .element(trigger)
      .toHaveAccessibleDescription("Tip to Better Giving");
  });

  test("a column header holding a tooltip is not named by the tip", async () => {
    const screen = await render(
      <table>
        <thead>
          <tr>
            <th>
              <span>Fees </span>
              <Tooltip
                tip={
                  <Content>
                    <p>Base fee 1.5%</p>
                    <p>charged when the tip screen is disabled</p>
                  </Content>
                }
              >
                <CircleHelp className="icon-sm" />
              </Tooltip>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>$1.20</td>
          </tr>
        </tbody>
      </table>
    );
    // vitest's role engine reports a th as "cell", so the header is queried
    const th = screen.container.querySelector("th") as HTMLElement;
    await expect.element(th).toHaveAccessibleName("Fees More info");
  });

  test("the wrapping button's hit area is at least 24px around a small glyph, without growing the line", async () => {
    const screen = await render(
      // padded off the viewport edge, where elementFromPoint returns null
      <p className="p-8 text-sm">
        Revenue{" "}
        <Tooltip tip={<Content>Refunded</Content>}>
          <CircleHelp className="inline icon-xs" />
        </Tooltip>
      </p>
    );
    const trigger = screen.getByRole("button").element();
    const glyph = trigger.querySelector("svg") as SVGElement;
    expect(glyph.getBoundingClientRect().width).toBeLessThan(24);
    // 11px from the button's centre: outside the 12px glyph, inside a 24px box
    const b = trigger.getBoundingClientRect();
    const cx = b.left + b.width / 2;
    const cy = b.top + b.height / 2;
    for (const [x, y] of [
      [cx + 11, cy],
      [cx - 11, cy],
      [cx, cy + 11],
      [cx, cy - 11],
    ] as const) {
      expect(trigger.contains(document.elementFromPoint(x, y))).toBe(true);
    }
    // the button's own box stays inside the line: the extra area is overlaid
    expect(b.height).toBeLessThan(24);
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
    await screen.getByRole("button", { name: "More info" }).click();
    await expect.element(page.getByRole("tooltip")).toBeVisible();
    await expect.element(smart).not.toBeChecked();
    await screen.getByText("Use smart milestones").click();
    await expect.element(smart).toBeChecked();
  });

  test('trigger="child" makes a component that renders a link the trigger: no button around it', async () => {
    const Docs = (p: ComponentProps<"a">) => (
      <a href="#docs" {...p}>
        Docs
      </a>
    );
    const screen = await render(
      <Tooltip trigger="child" tip={<Content>Opens the API guide</Content>}>
        <Docs />
      </Tooltip>
    );
    expect(screen.container.querySelectorAll("button")).toHaveLength(0);
    const link = screen.getByRole("link", { name: "Docs" });
    await link.hover();
    await expect
      .element(page.getByRole("tooltip"))
      .toHaveTextContent("Opens the API guide");
  });

  test("wrapping a component that renders its own link warns in development", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const Docs = () => <a href="#docs">Docs</a>;
    await render(
      <Tooltip tip={<Content>Opens the API guide</Content>}>
        <Docs />
      </Tooltip>
    );
    await expect.poll(() => warn.mock.calls.length).toBeGreaterThan(0);
    expect(String(warn.mock.calls[0][0])).toContain('trigger="child"');
    warn.mockRestore();
  });

  test("a wrapped glyph inside a link warns in development", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await render(
      <a href="#npo">
        Habitat{" "}
        <Tooltip tip={<Content>Verified</Content>}>
          <CircleHelp className="inline icon-xs" />
        </Tooltip>
      </a>
    );
    await expect.poll(() => warn.mock.calls.length).toBeGreaterThan(0);
    expect(String(warn.mock.calls[0][0])).toContain("inside a link or button");
    warn.mockRestore();
  });
});
