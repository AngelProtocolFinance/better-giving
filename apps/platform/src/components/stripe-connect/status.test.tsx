import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { StripeConnectStatus, type TConnectStatus } from "./status";

const labels: [TConnectStatus, string][] = [
  ["not_connected", "Not connected"],
  ["incomplete", "Finish setup on Stripe"],
  ["pending", "Pending review"],
  ["ready", "Ready to receive card donations"],
];

describe("StripeConnectStatus", () => {
  test.each(labels)("%s reads %s", async (status, label) => {
    const screen = await render(<StripeConnectStatus status={status} />);
    await expect
      .element(screen.getByText(label, { exact: true }))
      .toBeVisible();

    const dashboard = screen.getByRole("link", { name: /stripe dashboard/i });
    if (status === "not_connected") {
      // nothing to look at on Stripe before an account exists
      await expect.element(dashboard).not.toBeInTheDocument();
      return;
    }
    await expect
      .element(dashboard)
      .toHaveAttribute("href", "https://dashboard.stripe.com/");
    await expect.element(dashboard).toHaveAttribute("target", "_blank");
  });
});
