import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { Connections, type IConnectionRow } from "./connections";

function render_list(connections: IConnectionRow[]) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => <Connections connections={connections} />,
      HydrateFallback: () => null,
    },
  ]);
  return render(<Stub initialEntries={["/"]} />);
}

describe("Connections", () => {
  test("a connection shows its mask, who allowed it, and revoke", async () => {
    const created_at = "2026-03-04T15:30:00.000Z";
    const screen = await render_list([
      {
        id: "conn_8f3a",
        prefix: "bgk",
        last4: "4412",
        allowed_by_name: "Ada Lovelace",
        created_at,
        last_used_at: null,
      },
    ]);

    await expect
      .element(
        screen.getByRole("heading", { name: "Claude & ChatGPT connections" })
      )
      .toBeVisible();
    await expect.element(screen.getByText("bgk…4412")).toBeVisible();
    await expect.element(screen.getByText("Ada Lovelace")).toBeVisible();
    await expect
      .element(screen.getByText(new Date(created_at).toLocaleString()))
      .toBeVisible();
    await expect
      .element(screen.getByText("Never", { exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: /revoke/i }))
      .toBeVisible();
    expect(screen.container.textContent ?? "").not.toContain("conn_8f3a");
  });

  test("no connections yet shows the empty sentence and no revoke", async () => {
    const screen = await render_list([]);

    await expect
      .element(screen.getByText("No connections yet.", { exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: /revoke/i }))
      .not.toBeInTheDocument();
  });
});
