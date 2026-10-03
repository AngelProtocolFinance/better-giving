import { donation_receipt as dr } from "emails";
import { render } from "react-email";
import { describe, expect, test } from "vitest";

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
});
