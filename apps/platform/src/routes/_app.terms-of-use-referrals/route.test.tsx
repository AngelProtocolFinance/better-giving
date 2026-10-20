import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { TERMS_RECOVERY_FROM, TERMS_ZONE, terms_date_label } from "@/terms";
import TermsReferrals from "./route";

const RECOVERY_FROM = terms_date_label(TERMS_RECOVERY_FROM);

const Stub = createRoutesStub([
  { path: "/terms-of-use-referrals", Component: TermsReferrals },
]);

const render_terms = () =>
  render(<Stub initialEntries={["/terms-of-use-referrals"]} />);

const section_titles = (screen: Awaited<ReturnType<typeof render_terms>>) =>
  screen
    .getByRole("heading", { level: 3 })
    .elements()
    .map((h) => h.textContent);

const after_payment = async () => {
  const screen = await render_terms();
  const text =
    screen
      .getByRole("heading", {
        name: "Refunds and Chargebacks After Payment",
        exact: true,
      })
      .element()
      .closest("li")?.textContent ?? "";
  return { screen, text };
};

describe("referral terms", () => {
  test("recover a paid reward in its own section after Payment Terms, under the effective date", async () => {
    const screen = await render_terms();

    await expect
      .element(
        screen.getByText("Effective Date: October 23, 2026", {
          exact: true,
        })
      )
      .toBeVisible();

    const sections = section_titles(screen);
    const payment = sections.indexOf("Payment Terms");
    expect(sections.slice(payment, payment + 2)).toEqual([
      "Payment Terms",
      "Refunds and Chargebacks After Payment",
    ]);
  });

  test("the section it calls Section 4 is Payment Terms", async () => {
    const { screen, text } = await after_payment();
    const cited = /in Section (\d+) covers/.exec(text)?.[1];

    expect(cited).toBeDefined();
    expect(section_titles(screen)[Number(cited) - 1]).toBe("Payment Terms");
  });

  test("a part-refund owes the same share, and a reward already paid is deducted from the next payments", async () => {
    const { text } = await after_payment();

    expect(text).toContain(
      "Better Giving may deduct that reward from your next referral payments until it is recovered in full."
    );
    expect(text).toContain(
      "If only part of a donation is refunded or reversed, you owe the same share of the reward."
    );
  });

  test("a dispute deducts the disputed share when opened, settles by outcome, and a reopened win recovers again", async () => {
    const { text } = await after_payment();

    expect(text).toContain(
      "may deduct the disputed share of that reward as soon as the dispute is opened."
    );
    expect(text).toContain(
      "If the dispute is resolved in Better Giving’s favor, or the donor withdraws it, or it closes without the payment being reversed, Better Giving will cancel the amount owed;"
    );
    expect(text).toContain(
      "if it is resolved partly in Better Giving’s favor, you owe only the share of the reward on the part the donor keeps."
    );
    expect(text).toContain(
      "Any part of a cancelled amount already deducted is added to your next referral payment."
    );
    expect(text).toContain(
      "If a dispute that closed in Better Giving’s favor is later reopened, appealed or reversed and the donor keeps all or part of the payment, Better Giving may deduct the share of the reward on that part."
    );
  });

  test("the section applies from midnight in New York on the cut-off date", async () => {
    const { text } = await after_payment();

    expect(text).toContain(
      `This section applies only to donations made on or after the later of (i) 12:00 a.m. Eastern Time (${TERMS_ZONE}) on ${RECOVERY_FROM} and (ii) the date these revised Program Terms take effect.`
    );
  });

  test("a modification takes effect seven days after posting, and continued participation accepts it from then", async () => {
    const screen = await render_terms();
    const text = (
      screen
        .getByRole("heading", { name: "Modifications", exact: true })
        .element()
        .closest("li")?.textContent ?? ""
    ).replace(/\s+/g, " ");

    expect(text).toContain(
      "Better Giving reserves the right to modify these Terms at any time. A change takes effect seven (7) days after we post it, unless the posting states a later date. Continued participation after a change takes effect constitutes acceptance of the new Terms."
    );
  });
});
