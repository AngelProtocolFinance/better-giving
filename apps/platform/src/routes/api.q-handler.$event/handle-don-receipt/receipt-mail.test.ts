import { donation_receipt as dr } from "emails";
import { render } from "react-email";
import { describe, expect, test } from "vitest";
import { to_receipt } from "@/helpers/email";

const data: dr.IData = {
  base_url: "https://staging.example",
  id: "don-123",
  date: "2026-10-03",
  amount: { value: 100, currency: "USD", value_usd: 100 },
  to_name: "Save The Rainforest Foundation",
  from: { first_name: "Jane", full_name: "Jane Doe" },
  lines: [
    {
      kind: "beneficiary",
      name: "Save The Rainforest Foundation",
      amount: { value: 100, currency: "USD", value_usd: 100 },
    },
  ],
};

describe("donation receipt mail", () => {
  test("links to the sending environment, not production", async () => {
    const html = await render(dr.template(data).node);

    expect(html).toContain('href="https://staging.example/donations/don-123"');
    expect(html).toContain('href="https://staging.example/register"');
    expect(html).not.toContain("better.giving/donations");
    expect(html).not.toContain("better.giving/register");
  });

  /** the receipt `build_receipt` mails for a $250 gift to one nonprofit, as plain text */
  const receipt_text = (via: string) =>
    render(
      dr.template(
        to_receipt(
          {
            id: "don-9",
            to_id: "20",
            to_name: "Freegan Food Foundation",
            to_type: "npo",
            created_at: "2026-10-03T00:00:00.000Z",
            amount: { base: 250, tip: 0, fee_allowance: 0 },
            upusd: 1,
            currency: "USD",
            via,
          },
          [20],
          [{ id: 20, name: "Freegan Food Foundation" }],
          {
            from: { first_name: "Jane", full_name: "Jane Doe" },
            tax_receipt_id: "R-9",
            bg_npo_id: 1,
            base_url: "https://staging.example",
          }
        )
      ).node,
      { plainText: true }
    );

  test("a settled stock gift reads as securities sold, keeps its USD total, and drops the cash deduction claim", async () => {
    const text = await receipt_text("stocks");

    expect(text).toContain(
      "Gift type: Securities (stock), sold — amount shown is the sale proceeds"
    );
    expect(text).toContain("Total: 250.00 USD");
    expect(text).toContain(
      "No goods or services are provided to you in exchange for your gift."
    );
    expect(text).not.toContain("the full amount you paid");
  });

  test.each(["stripe:card", "cheque"])(
    "a %s receipt keeps the full-amount deduction line and no gift type",
    async (via) => {
      const text = await receipt_text(via);

      expect(text).toContain(
        "No goods or services are provided to you in exchange for your gift, so the full amount you paid qualifies as a charitable contribution for US tax purposes."
      );
      expect(text).not.toContain("Gift type");
    }
  );
});
