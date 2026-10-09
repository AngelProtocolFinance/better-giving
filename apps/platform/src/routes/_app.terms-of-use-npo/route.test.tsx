import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import TermsNonprofits from "./route";

const Stub = createRoutesStub([
  { path: "/terms-of-use-npo", Component: TermsNonprofits },
]);

describe("nonprofit terms", () => {
  test("carry the recovery items in Receiving Grants, before Fees, under the effective date", async () => {
    const screen = await render(
      <Stub initialEntries={["/terms-of-use-npo"]} />
    );

    await expect
      .element(
        screen.getByText("Effective October 16, 2026", {
          exact: true,
        })
      )
      .toBeVisible();

    const receiving = screen
      .getByRole("heading", { name: "Receiving Grants from Better Giving" })
      .element()
      .closest("li") as HTMLElement;
    const item_titles = Array.from(
      receiving.querySelectorAll(":scope > ol > li > b:first-child"),
      (b) => b.textContent
    );
    expect(item_titles).toEqual([
      "Refunds and Chargebacks.",
      "Disputed Payments.",
      "Outstanding Recovery Amounts.",
      "Fees:",
    ]);
  });
});
