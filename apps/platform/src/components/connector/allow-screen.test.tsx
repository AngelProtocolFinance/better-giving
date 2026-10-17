import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { AllowScreen, type IAllowScreen } from "./allow-screen";

const disclosure =
  "The connection can read donors' names and email addresses, donations, campaigns, and forms. It can record offline gifts and start draft campaigns. It cannot move money.";

function render_screen(props: IAllowScreen) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => <AllowScreen {...props} />,
      HydrateFallback: () => null,
    },
  ]);
  return render(<Stub initialEntries={["/"]} />);
}

describe("AllowScreen", () => {
  test("an admin with two nonprofits sees both and can allow or deny", async () => {
    const screen = await render_screen({
      state: "oauth-state",
      nonprofits: [
        { id: 12, name: "Harbor Food Bank" },
        { id: 48, name: "Ridge Clinic" },
      ],
    });

    await expect
      .element(
        screen.getByRole("heading", {
          name: "This chat wants to connect to a nonprofit",
        })
      )
      .toBeVisible();
    await expect
      .element(screen.getByText(disclosure, { exact: true }))
      .toBeVisible();

    const harbor = screen.getByRole("radio", { name: "Harbor Food Bank" });
    const ridge = screen.getByRole("radio", { name: "Ridge Clinic" });
    await expect.element(harbor).toBeVisible();
    await expect.element(ridge).toBeVisible();
    await expect.element(harbor).toHaveAttribute("value", "12");
    await expect.element(ridge).toHaveAttribute("value", "48");
    await expect.element(harbor).not.toBeChecked();
    await expect.element(ridge).not.toBeChecked();

    const allow = screen.getByRole("button", { name: "Allow", exact: true });
    const deny = screen.getByRole("button", { name: "Deny", exact: true });
    await expect.element(allow).toBeVisible();
    await expect.element(deny).toBeVisible();
    await expect.element(allow).toHaveAttribute("name", "decision");
    await expect.element(allow).toHaveAttribute("value", "allow");
    await expect.element(deny).toHaveAttribute("name", "decision");
    await expect.element(deny).toHaveAttribute("value", "deny");
  });

  test("the only nonprofit is already selected", async () => {
    const screen = await render_screen({
      state: "oauth-state",
      nonprofits: [{ id: 7, name: "Only Kitchen" }],
    });

    await expect
      .element(screen.getByRole("radio", { name: "Only Kitchen" }))
      .toBeChecked();
  });

  test("a refusal to choose is an alert above the buttons", async () => {
    const screen = await render_screen({
      state: "oauth-state",
      nonprofits: [
        { id: 12, name: "Harbor Food Bank" },
        { id: 48, name: "Ridge Clinic" },
      ],
      error: "Choose a nonprofit",
    });

    const alert = screen.getByRole("alert");
    await expect.element(alert).toBeVisible();
    await expect.element(alert).toHaveTextContent("Choose a nonprofit");
  });

  test("an account with no nonprofit can only deny", async () => {
    const screen = await render_screen({
      state: "oauth-state",
      nonprofits: [],
    });

    await expect
      .element(
        screen.getByText("This account does not administer a nonprofit yet.", {
          exact: true,
        })
      )
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Deny", exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Allow", exact: true }))
      .not.toBeInTheDocument();
    await expect.element(screen.getByRole("radio")).not.toBeInTheDocument();
  });
});
