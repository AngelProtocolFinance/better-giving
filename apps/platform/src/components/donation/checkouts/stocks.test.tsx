import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { StocksDonationDetails } from "../types";
import { Stocks } from "./stocks";

const don_mock = vi.hoisted(() => ({
  recipient: { id: "1", name: "test npo", members: [] },
  source: "bg-marketplace",
  mode: "live",
  config: null,
  base_url: "https://test.example.com",
}));
vi.mock("../context", () => ({
  use_donation: vi.fn().mockReturnValue({ don: don_mock, don_set: vi.fn() }),
}));

// usdpu 200 → two share decimals, so 10 shares + a 15% tip reads "11.50"
const fv: StocksDonationDetails = {
  ticker: { symbol: "AAPL", amount: "10", usdpu: 200, min: 0, name: "Apple" },
  tip: "",
  tip_format: "15",
};

describe("stocks checkout", () => {
  test("broker email carries the same tipped share count the screen shows", async () => {
    const screen = await render(<Stocks {...fv} />);

    const shares_label = screen.getByText("Shares:", { exact: true });
    await expect.element(shares_label).toBeVisible();
    expect(
      (shares_label.element() as HTMLElement).parentElement?.textContent
    ).toBe("Shares:11.50");

    const email = screen.getByRole("link", { name: /generate email/i });
    await expect.element(email).toHaveAttribute("href");
    const mailto = email.element().getAttribute("href") ?? "";
    expect(mailto).toContain("Ticker: AAPL%0D%0A");
    expect(mailto).toContain("Shares: 11.50%0D%0A");
  });
});
