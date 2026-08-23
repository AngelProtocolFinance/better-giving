import type { PropsWithChildren } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { Button } from "./button";

function Loc() {
  return <p data-testid="loc">{useLocation().pathname}</p>;
}

/** playwright refuses to click an element carrying `aria-disabled` — which is
 *  the state being announced correctly, not the behaviour under test. the
 *  interception is what has to be proved, so these go through a real bubbling
 *  dom click that reaches react's root listener regardless. */
const dom_click = (el: Element) =>
  el.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true })
  );

/** the link forms need a router; the button form is unaffected by one. */
function Router({ children }: PropsWithChildren) {
  return (
    <MemoryRouter initialEntries={["/start"]}>
      <Loc />
      {children}
    </MemoryRouter>
  );
}

describe("element form", () => {
  test("renders a button, type button by default", async () => {
    const screen = await render(<Button variant="primary">Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    await expect.element(btn).toHaveAttribute("type", "button");
  });

  test("takes an explicit type", async () => {
    const screen = await render(
      <Button variant="primary" type="submit">
        Save
      </Button>
    );
    await expect
      .element(screen.getByRole("button", { name: "Save" }))
      .toHaveAttribute("type", "submit");
  });

  test("`to` renders a Link, `to` + `nav` a NavLink", async () => {
    const screen = await render(
      <Router>
        <Button variant="primary" to="/start">
          plain
        </Button>
        <Button variant="primary" to="/start" nav>
          nav
        </Button>
      </Router>
    );
    // both render an <a href>; only NavLink marks the matched route.
    const plain = screen.getByRole("link", { name: "plain" });
    const nav = screen.getByRole("link", { name: "nav" });
    await expect.element(plain).toHaveAttribute("href", "/start");
    await expect.element(plain).not.toHaveAttribute("aria-current");
    await expect.element(nav).toHaveAttribute("aria-current", "page");
  });

  test("`href` renders a plain anchor", async () => {
    const screen = await render(
      <Button variant="secondary" href="https://better.giving">
        docs
      </Button>
    );
    await expect
      .element(screen.getByRole("link", { name: "docs" }))
      .toHaveAttribute("href", "https://better.giving");
  });
});

describe("disabled", () => {
  test("a button carries the attribute", async () => {
    const screen = await render(
      <Button variant="primary" disabled>
        Save
      </Button>
    );
    await expect
      .element(screen.getByRole("button", { name: "Save" }))
      .toBeDisabled();
  });

  test("a link announces it, never spells it, and does not navigate", async () => {
    const on_click = vi.fn();
    const screen = await render(
      <Router>
        <Button variant="primary" to="/next" disabled onClick={on_click}>
          go
        </Button>
      </Router>
    );
    const link = screen.getByRole("link", { name: "go" });
    await expect.element(link).toHaveAttribute("aria-disabled", "true");
    // `disabled` on an anchor does nothing at all — the attribute being absent
    // is the point, and the interception below is what replaces it.
    await expect.element(link).not.toHaveAttribute("disabled");

    dom_click(link.element());
    await expect.element(screen.getByTestId("loc")).toHaveTextContent("/start");
    expect(on_click).not.toHaveBeenCalled();
  });

  test("the same click navigates when the link is not disabled", async () => {
    const screen = await render(
      <Router>
        <Button variant="primary" to="/next">
          go
        </Button>
      </Router>
    );
    dom_click(screen.getByRole("link", { name: "go" }).element());
    await expect.element(screen.getByTestId("loc")).toHaveTextContent("/next");
  });

  test("a raw anchor is intercepted the same way", async () => {
    const on_click = vi.fn();
    const screen = await render(
      <Button
        variant="primary"
        href="https://better.giving"
        disabled
        onClick={on_click}
      >
        docs
      </Button>
    );
    const link = screen.getByRole("link", { name: "docs" });
    await expect.element(link).toHaveAttribute("aria-disabled", "true");
    dom_click(link.element());
    expect(on_click).not.toHaveBeenCalled();
  });
});

describe("in flight", () => {
  test("takes the pending class and stops responding", async () => {
    const screen = await render(
      <Button variant="primary" is_loading>
        Save
      </Button>
    );
    const btn = screen.getByRole("button");
    await expect.element(btn).toHaveClass("pending");
    await expect.element(btn).toBeDisabled();
  });

  test("the loading text replaces the label", async () => {
    const screen = await render(
      <Button variant="primary" is_loading>
        Save
      </Button>
    );
    await expect
      .element(screen.getByRole("button"))
      .toHaveTextContent("Submitting...");
  });

  test("loading_text overrides it", async () => {
    const screen = await render(
      <Button variant="primary" is_loading loading_text="Saving...">
        Save
      </Button>
    );
    const btn = screen.getByRole("button");
    await expect.element(btn).toHaveTextContent("Saving...");
    await expect.element(btn).not.toHaveTextContent("Save");
  });

  test("a link in flight is announced and intercepted", async () => {
    const screen = await render(
      <Router>
        <Button variant="primary" to="/next" is_loading>
          go
        </Button>
      </Router>
    );
    const link = screen.getByRole("link");
    await expect.element(link).toHaveAttribute("aria-disabled", "true");
    await expect.element(link).toHaveClass("pending");
    dom_click(link.element());
    await expect.element(screen.getByTestId("loc")).toHaveTextContent("/start");
  });
});

describe("icon-only", () => {
  test("writes btn-icon and exposes the name", async () => {
    const screen = await render(
      <Button variant="ghost" size="sm" icon aria-label="Close">
        <svg aria-hidden="true" />
      </Button>
    );
    const btn = screen.getByRole("button", { name: "Close" });
    await expect.element(btn).toHaveClass("btn-icon");
  });
});

describe("the closed class sets", () => {
  // every string is a full literal looked up by key. tailwind v4 is a jit over
  // source text, so a composed `btn-${variant}` would compile to no rule and
  // no error — these assertions are what pin the spelling.
  const variants = [
    ["primary", "btn btn-primary"],
    ["secondary", "btn btn-secondary"],
    ["ghost", "btn btn-ghost"],
    ["destructive", "btn btn-destructive"],
    ["outline", "btn btn-outline"],
    ["success", "btn btn-success"],
    ["warning", "btn btn-warning"],
  ] as const;

  for (const [variant, expected] of variants) {
    test(`${variant} writes \`${expected}\``, async () => {
      const screen = await render(<Button variant={variant}>x</Button>);
      expect(screen.getByRole("button").element().className).toBe(expected);
    });
  }

  const sizes = [
    // md writes no size class: bare `.btn` IS the md tier.
    ["md", "btn btn-primary"],
    ["sm", "btn btn-sm btn-primary"],
    ["lg", "btn btn-lg btn-primary"],
    ["field", "btn btn-field btn-primary"],
  ] as const;

  for (const [size, expected] of sizes) {
    test(`size ${size} writes \`${expected}\``, async () => {
      const screen = await render(
        <Button variant="primary" size={size}>
          x
        </Button>
      );
      expect(screen.getByRole("button").element().className).toBe(expected);
    });
  }

  test("the caller's className is appended last", async () => {
    const screen = await render(
      <Button variant="primary" className="w-full">
        x
      </Button>
    );
    expect(screen.getByRole("button").element().className).toBe(
      "btn btn-primary w-full"
    );
  });
});
