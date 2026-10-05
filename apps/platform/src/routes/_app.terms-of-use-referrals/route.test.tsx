import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import TermsReferrals from "./route";

const Stub = createRoutesStub([
  { path: "/terms-of-use-referrals", Component: TermsReferrals },
]);

describe("referral terms", () => {
  test("recover a paid reward in its own section after Payment Terms, under a placeholder date", async () => {
    const screen = await render(
      <Stub initialEntries={["/terms-of-use-referrals"]} />
    );

    await expect
      .element(
        screen.getByText("Effective Date: [EFFECTIVE DATE — fill at posting]", {
          exact: true,
        })
      )
      .toBeVisible();

    const sections = screen
      .getByRole("heading", { level: 3 })
      .elements()
      .map((h) => h.textContent);
    const payment = sections.indexOf("Payment Terms");
    expect(sections.slice(payment, payment + 2)).toEqual([
      "Payment Terms",
      "Refunds and Chargebacks After Payment",
    ]);
  });
});
