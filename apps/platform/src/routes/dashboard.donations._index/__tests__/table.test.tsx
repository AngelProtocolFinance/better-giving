import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import type { IRow } from "../helpers";
import { Table } from "../table";

const row = (o: Partial<IRow>): IRow => ({
  id: "don-001",
  date: "2025-01-01",
  status: "settled",
  currency: "USD",
  amount: 25,
  usd_value: 25,
  payment_method: "card",
  frequency: "one-time",
  recipient_id: "1",
  recipient_name: "Test NPO",
  recipient_type: "npo",
  via_id: "stripe:card",
  ...o,
});

async function render_table(items: IRow[]) {
  const Stub = createRoutesStub([
    {
      path: "/dashboard/donations",
      Component: () => <Table items={items} />,
    },
  ]);
  return await render(<Stub initialEntries={["/dashboard/donations"]} />);
}

describe("my donations — the row's receipt control", () => {
  test("a settled row links to its receipt", async () => {
    const screen = await render_table([row({ status: "settled" })]);
    await expect
      .element(screen.getByRole("link", { name: "View receipt" }))
      .toBeInTheDocument();
  });

  test.each(["refunded", "refunded_loss"] as const)(
    "a %s row offers no receipt, and no bank verification from its old intent",
    async (status) => {
      // a stripe bank payment keeps its verification link in via_extra
      // after it settles and is refunded
      const screen = await render_table([
        row({
          status,
          via_id: "stripe:us_bank_account",
          via_extra: "https://verify.example/x",
        }),
      ]);
      await expect.element(screen.getByText("Test NPO")).toBeVisible();
      expect(
        screen.getByRole("link", { name: "View receipt" }).query()
      ).toBeNull();
      expect(screen.getByText("Verify Bank").query()).toBeNull();
    }
  );
});
