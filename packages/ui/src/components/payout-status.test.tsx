import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { PayoutStatus, type PayoutStatusType } from "./payout-status";

const ink = async (type: PayoutStatusType, label: string) => {
  const screen = await render(<PayoutStatus type={type} />);
  const status = screen.getByText(label);
  await expect.element(status).toBeVisible();
  return getComputedStyle(status.element()).color;
};

describe("PayoutStatus", () => {
  test("labels a processing payout 'Processing'", async () => {
    const screen = await render(<PayoutStatus type="processing" />);
    await expect.element(screen.getByText("Processing")).toBeVisible();
  });

  test("paints processing in pending's in-flight ink, not the cancelled gray", async () => {
    const processing = await ink("processing", "Processing");
    expect(processing).toBe(await ink("pending", "Pending"));
    expect(processing).not.toBe(await ink("cancelled", "Cancelled"));
  });
});
