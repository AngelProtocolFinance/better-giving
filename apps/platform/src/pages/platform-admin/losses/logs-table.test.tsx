import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import type { ILossLog } from "@/revenue";
import { LogsTable } from "./logs-table";

const loss = (o: Partial<ILossLog>): ILossLog => ({
  id: "loss-1",
  date: "2026-09-20T10:00:00.000Z",
  donation_id: "don-1",
  dist_id: "dist-1",
  npo_id: 7,
  referrer_user: null,
  referrer_npo: null,
  type: "payout",
  amount: 50,
  npo_amount: 45,
  fees_bg: 3,
  fees_processing: 2,
  reason: "refunded after payout",
  actor: null,
  ...o,
});

describe("losses log table", () => {
  test("a referrer's write-off names the referrer, its reason and the admin; an npo loss keeps its npo", async () => {
    const screen = await render(
      <LogsTable
        items={[
          loss({}),
          loss({
            id: "loss-2",
            donation_id: "don-2",
            dist_id: null,
            npo_id: null,
            referrer_user: "REF42",
            type: "write_off",
            amount: 53.2,
            reason: "referrer unreachable",
            actor: "admin-1",
          }),
        ]}
      />
    );
    const write_off = screen.getByRole("row").filter({ hasText: "don-2" });
    await expect.element(write_off).toMatchTextContent("REF42");
    await expect.element(write_off).toMatchTextContent("Referrer");
    await expect.element(write_off).toMatchTextContent("Write-off");
    await expect.element(write_off).toMatchTextContent("by admin-1");
    await expect.element(write_off).toMatchTextContent("referrer unreachable");

    const payout = screen.getByRole("row").filter({ hasText: "don-1" });
    await expect.element(payout).toMatchTextContent("payout");
    await expect.element(payout).not.toMatchTextContent("Referrer");
  });
});
