import { EIN } from "@better-giving/brand";
import { describe, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { mailto_fields } from "#/__tests__/fixtures/mailto";
import { emails } from "@/constants/common";
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

const PROFILE_URL = "https://test.example.com/marketplace/1";

async function email_fields(screen: Awaited<ReturnType<typeof render>>) {
  const email = screen.getByRole("link", { name: /generate email/i });
  await expect.element(email).toHaveAttribute("href");
  return mailto_fields((email.element() as HTMLAnchorElement).href);
}

describe("stocks checkout", () => {
  test("broker email carries the same tipped share count the screen shows", async () => {
    don_mock.recipient.name = "test npo";
    const screen = await render(<Stocks {...fv} />);

    const shares_label = screen.getByText("Shares:", { exact: true });
    const shares_row = (shares_label.element() as HTMLElement).parentElement;
    if (!shares_row) throw new Error("shares label has no row");
    await expect
      .element(page.elementLocator(shares_row))
      .toMatchTextContent(/^Shares:\s*11\.50$/);

    const body = (await email_fields(screen)).get("body") ?? "";
    expect(body.split("\r\n")).toEqual(
      expect.arrayContaining(["Ticker: AAPL", "Shares: 11.50"])
    );
  });

  test("a recipient named with &, # and % reaches the broker email whole", async () => {
    const name = "Boys & Girls Club #7 (100% volunteer)";
    don_mock.recipient.name = name;
    const screen = await render(<Stocks {...fv} />);

    const fields = await email_fields(screen);
    expect(fields.get("subject")).toBe(
      `Stock donation to Better Giving supporting ${name}`
    );
    expect(fields.get("body")?.split("\r\n")).toEqual(
      expect.arrayContaining([
        `I would like to make a charitable stock donation to Better Giving in support of ${name} (${PROFILE_URL}).`,
        `Reference: ${name} (${PROFILE_URL})`,
        "Ticker: AAPL",
        "Shares: 11.50",
        `Better Giving EIN: ${EIN}`,
        "Thank you.",
      ])
    );
    expect(fields.get("cc")).toBe(emails.hi);
  });
});
