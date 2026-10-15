import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import TermsDonors from "#/routes/_app.terms-of-use/route";
import TermsNonprofits from "#/routes/_app.terms-of-use-npo/route";
import TermsReferrals from "#/routes/_app.terms-of-use-referrals/route";

/** the text of the list item whose own title (a direct `child`) reads `title` */
const titled = (root: HTMLElement, child: string, title: string) => {
  const li = Array.from(root.querySelectorAll("li")).find(
    (li) => li.querySelector(`:scope > ${child}`)?.textContent === title
  );
  return li?.textContent ?? "";
};

/** the three terms word one rule for three readers; each states the outcomes
 * of a dispute (won, withdrawn, closed unreversed, kept in part or whole,
 * reopened) in its own voice, so `own` is what each page actually says */
const PAGES = [
  {
    name: "donor 1(c)",
    page: TermsDonors,
    clause: (root: HTMLElement) => titled(root, "b", "Disputed Payments"),
    own: [
      "If the dispute is resolved in Better Giving’s favor, or you withdraw it, or it closes without the payment being reversed, the donation stands as a charitable contribution and your original receipt remains valid.",
      "If you keep all or part of the disputed amount, that amount is treated as refunded under Section 1(a)",
      "later reopened, appealed or reversed and you keep all or part of the payment",
    ],
  },
  {
    name: "npo 4(i)",
    page: TermsNonprofits,
    clause: (root: HTMLElement) => titled(root, "b", "Disputed Payments."),
    own: [
      "if it is resolved in Better Giving’s favor, or the Donor withdraws it, or it closes without the payment being reversed, Better Giving will cancel that Recovery Amount, including the dispute fee;",
      "if it is resolved partly in Better Giving’s favor, the Recovery Amount is reduced to the fraction of the donation the Donor keeps, calculated as in Section 4(g) (including the dispute fee in full), and the rest is cancelled; and",
      "if the Donor keeps the whole disputed amount, the Recovery Amount stands.",
      "Any part of a cancelled Recovery Amount already deducted from you under Section 4(j), and any part of the disputed amount the Donor does not keep that was taken back from your Savings or Investment balance or from a grant cancelled under Section 4(h), will be added to your next grant or, if no grant is payable to you or this Agreement has ended, paid to you.",
      "later reopened, appealed or reversed and the Donor keeps all or part of the payment, that part is again a Reversed Donation",
    ],
  },
  {
    name: "referral terms",
    page: TermsReferrals,
    clause: (root: HTMLElement) =>
      titled(root, "h3", "Refunds and Chargebacks After Payment"),
    own: [
      "If the dispute is resolved in Better Giving’s favor, or the donor withdraws it, or it closes without the payment being reversed, Better Giving will cancel the amount owed;",
      "if it is resolved partly in Better Giving’s favor, you owe only the share of the reward on the part the donor keeps.",
      "later reopened, appealed or reversed and the donor keeps all or part of the payment",
    ],
  },
];

/** the outcome phrases every page must carry, whoever it is written for */
const SHARED = [
  /Better Giving’s favor, or (you|the [Dd]onor) withdraws? it, or it closes without the payment being reversed/,
  /dispute that closed in Better Giving’s favor is later reopened, appealed or reversed/,
];

describe("dispute outcomes across the terms", () => {
  test.each(PAGES)("$name holds the shared outcome phrases", async (c) => {
    const Stub = createRoutesStub([{ path: "/", Component: c.page }]);
    const screen = await render(<Stub />);
    const text = c.clause(screen.container);

    expect(text).not.toBe("");
    for (const phrase of SHARED) expect(text).toMatch(phrase);
    for (const phrase of c.own) expect(text).toContain(phrase);
  });
});
