import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import TermsNonprofits from "./route";

const Stub = createRoutesStub([
  { path: "/terms-of-use-npo", Component: TermsNonprofits },
]);

const render_terms = () =>
  render(<Stub initialEntries={["/terms-of-use-npo"]} />);

/** the numbered sections: the items of the page's outermost list */
const sections_of = (root: HTMLElement) =>
  Array.from(root.querySelectorAll(".page > ol > li")) as HTMLElement[];

/** the lettered items directly under section `n` */
const items_of = (root: HTMLElement, n: number) =>
  Array.from(
    sections_of(root)[n - 1]?.querySelectorAll(":scope > ol > li") ?? []
  ) as HTMLElement[];

/** the text of item `letter` of section `n`, as "Section n(letter)" cites it */
const clause = (root: HTMLElement, n: number, letter: string) =>
  (
    items_of(root, n)[letter.charCodeAt(0) - "a".charCodeAt(0)]?.textContent ??
    ""
  ).trim();

const CUT_OFF =
  "Sections 4(g) and 4(j), and the last two sentences of Section 4(h), apply only to donations made on or after 12:00 a.m. Eastern Time (America/New_York) on October 18, 2026.";

describe("nonprofit terms", () => {
  test("carry the recovery items in Receiving Grants, before Fees, under the effective date", async () => {
    const screen = await render_terms();

    await expect
      .element(
        screen.getByText("Effective October 18, 2026", {
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
      "Savings and Investment Balances.",
      "Disputed Payments.",
      "Outstanding Recovery Amounts.",
      "Fees:",
    ]);
  });

  test("every section a clause cites exists", async () => {
    const screen = await render_terms();
    const root = screen.container;
    const text = root.textContent ?? "";

    // "Section 8(f)", "4(g) through 4(j)"; an Internal Revenue Code section
    // (501(c), 509(a)) is no section of these terms
    const lettered = Array.from(text.matchAll(/\b(\d{1,2})\(([a-z])\)/g));
    expect(lettered.length).toBeGreaterThan(0);
    for (const [ref, n, letter] of lettered) {
      const i = letter!.charCodeAt(0) - "a".charCodeAt(0);
      expect(items_of(root, Number(n))[i], ref).toBeDefined();
    }
    const sections = sections_of(root).length;
    expect(sections).toBe(9);
    for (const [ref, n] of text.matchAll(/\bSections? (\d{1,2})\b(?!\()/g)) {
      expect(Number(n), ref).toBeLessThanOrEqual(sections);
    }
  });

  test("each load-bearing citation lands on the clause its sentence is about", async () => {
    const screen = await render_terms();
    const root = screen.container;
    const text = root.textContent ?? "";

    // "4g" is clause 4(g); "*" is the whole page
    const at = (ref: string) =>
      ref === "*" ? text : clause(root, Number(ref[0]), ref[1]!);
    const citations = [
      ["1d", "Section 3(d)", "3d", "Better Giving, as the recipient"],
      ["8e", "Section 8(f)", "8f", "The obligations of Sections"],
      ["*", "Section 9(d)", "9d", "We may amend this Agreement"],
      ["8f", "Section 4(j)", "4j", "Outstanding Recovery Amounts."],
      ["4g", "Section 4(j)", "4j", "Outstanding Recovery Amounts."],
      ["4i", "Section 4(g)", "4g", "Refunds and Chargebacks."],
      ["*", "UNDER SECTION 4(i)", "4i", "Disputed Payments."],
      ["4k", "Section 4(k)", "4k", "Fees:"],
    ] as const;
    for (const [from, cite, to, opens] of citations) {
      expect(at(from), cite).toContain(cite);
      expect(at(to).startsWith(opens), `${cite} -> ${opens}`).toBe(true);
    }

    // 9(d) sends a rejecting NPO to Section 8, the termination section
    expect(clause(root, 9, "d")).toContain("as set forth in Section 8 of this");
    // a posting may push its effective date later, never sooner than 7 days
    expect(clause(root, 9, "d")).toContain(
      "Unless such a posting expressly states a later effective date, all amended terms shall automatically be effective and legally binding upon you seven (7) days after having been posted."
    );
    expect(sections_of(root)[7]?.querySelector("h3")?.textContent).toBe(
      "Term and Termination."
    );
  });

  test("4(g) recovers the refunded fraction of the grant and of its processing fees, the dispute fee in full, split across NPOs by allocation", async () => {
    const screen = await render_terms();
    const g = clause(screen.container, 4, "g");

    expect(g).toContain(
      "the refunded or reversed fraction of the amount granted to you from that donation (for example, if a quarter of the donation is refunded, a quarter of that grant)"
    );
    expect(g).toContain(
      "plus the same fraction of its payment processing fees"
    );
    expect(g).toContain(
      "plus any dispute fee in full (split in proportion to the amounts allocated to each NPO where the donation supported more than one NPO)"
    );
  });

  test("4(h) takes Savings back, redeems Fund units at the day's value, and a shortfall makes the whole part and the dispute fee recoverable", async () => {
    const screen = await render_terms();
    const h = clause(screen.container, 4, "h");

    expect(h).toContain(
      "Better Giving may take that part back from the balance, or cancel that grant"
    );
    expect(h).toContain(
      "Better Giving redeems units of the Fund equal in value to the part of that donation’s Investment allocation that is reversed and not yet granted to you, at the Fund’s unit value on the day of the reversal."
    );
    // the cut-off names "the last two sentences of Section 4(h)"; these are them
    expect(h.split("on the day of the reversal. ")[1]).toBe(
      "If the balance is not enough to cover that part, for example because of a Withdrawal, Better Giving may instead treat the whole part, with its payment processing fees, as a Recovery Amount. Any dispute fee on the donation is a Recovery Amount in every case."
    );
  });

  test("4(j) lets Better Giving invoice what is still owed, due in thirty days, and names the triggers", async () => {
    const screen = await render_terms();
    const j = clause(screen.container, 4, "j");

    expect(j).toContain(
      "If you stop using the Platform, this Agreement is terminated, or no grant is payable to you within ninety (90) days after Better Giving notifies you of a Recovery Amount, Better Giving may instead invoice you for the amount still owed, and you agree to pay it within thirty (30) days of the invoice."
    );
    expect(j).toContain(
      "Better Giving may also collect it from you by any other lawful means."
    );
  });

  test("the cut-off sentence names the clauses it limits and midnight in New York", async () => {
    const screen = await render_terms();
    const j = clause(screen.container, 4, "j");

    expect(j).toContain(CUT_OFF);
  });

  test("4(i)'s return of amounts taken back under 4(h) is not limited by the cut-off", async () => {
    const screen = await render_terms();
    const root = screen.container;

    expect(clause(root, 4, "i")).toContain(
      "any part of the disputed amount the Donor does not keep that was taken back from your Savings or Investment balance or from a grant cancelled under Section 4(h), will be added to your next grant or, if no grant is payable to you or this Agreement has ended, paid to you."
    );
    const cut_off = clause(root, 4, "j").split("at its discretion. ")[1];
    expect(cut_off).toBe(CUT_OFF);
    expect(cut_off).not.toContain("4(i)");
  });

  test("4(k) claims no other fees, deducts processing fees before allocation, and hides nothing", async () => {
    const screen = await render_terms();
    const k = clause(screen.container, 4, "k");

    expect(k).toContain("any Recovery Amount under Sections 4(g) through 4(j)");
    expect(k).toContain("There are no other fees or recurring charges.");
    expect(k).toContain(
      "Payment Processing Fees. Card, bank and other payment processing fees charged on a donation are deducted from it before it is allocated, unless the Donor chooses to cover them."
    );
    expect(k).toContain("a flat 1.5% fee on all donations made");
    expect(k).not.toContain("hidden");
  });

  test("a platform donation's tax receipt is Better Giving's: the npo issues none of its own", async () => {
    const screen = await render_terms();
    const root = screen.container;

    expect(clause(root, 1, "d")).toContain(
      "you must not issue your own tax receipt for a donation made through the Platform (see Section 3(d))"
    );
    expect(clause(root, 3, "d")).toContain(
      "Better Giving, as the recipient of every donation made through the Platform, issues the Donor’s tax receipt. You must not issue a tax receipt"
    );
  });

  test("the survival item lists the recovery right and names the right to invoice; the termination item points to it", async () => {
    const screen = await render_terms();
    const root = screen.container;

    expect(clause(root, 8, "e")).toContain("as set forth in Section 8(f).");
    const survival = clause(root, 8, "f");
    expect(survival).toContain(
      "The obligations of Sections 3(b), 3(d), 4(c), 4(e), 4(g) through 4(j), 5, 6, 7, 8 and 9 will survive the termination of this Agreement."
    );
    expect(survival).not.toMatch(/Section 10|\b10\b/);
    expect(survival).toContain(
      "may invoice and collect it from you directly under Section 4(j)."
    );
  });

  test("a change takes effect seven days after posting, in 9(d) as in the intro, and the prior version stays linked", async () => {
    const screen = await render_terms();

    expect(screen.container.textContent).not.toContain("effective immediately");
    expect(screen.container.textContent).toContain(
      "As set out in Section 9(d), a change takes effect seven (7) days after we post it"
    );
    expect(clause(screen.container, 9, "d")).toContain(
      "shall automatically be effective and legally binding upon you seven (7) days after having been posted."
    );
    await expect
      .element(
        screen.getByRole("link", {
          name: "Nonprofit Terms of Use (October 2024)",
        })
      )
      .toHaveAttribute("href", "/terms-of-use-npo-2024");
  });

  test("the liability cap spares what is owed to the npo", async () => {
    const screen = await render_terms();

    expect(screen.container.textContent).toContain(
      "THAT LIMIT DOES NOT APPLY TO ANY AMOUNT BETTER GIVING OWES YOU UNDER THIS AGREEMENT"
    );
  });
});
