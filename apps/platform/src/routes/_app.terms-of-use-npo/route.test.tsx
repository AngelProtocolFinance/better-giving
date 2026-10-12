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

  test("the survival item points to itself and names the right to invoice", async () => {
    const screen = await render_terms();
    const termination = items_of(screen.container, 8);

    expect(termination[4]?.textContent).toContain(
      "as set forth in Section 8(f)."
    );
    const survival = termination[5]?.textContent ?? "";
    expect(survival).toContain(
      "may invoice and collect it from you directly under Section 4(j)."
    );
    // the survival list itself: every number in it a section that exists
    const listed = /Sections (.*) will survive/.exec(survival)?.[1] ?? "";
    for (const [n] of listed.matchAll(/\b\d+\b(?!\))/g)) {
      expect(Number(n), listed).toBeLessThanOrEqual(9);
    }
  });

  test("a change takes effect seven days after posting, and the prior version stays linked", async () => {
    const screen = await render_terms();

    expect(screen.container.textContent).not.toContain("effective immediately");
    expect(screen.container.textContent).toContain(
      "As set out in Section 9(d), a change takes effect seven (7) days after we post it"
    );
    await expect
      .element(
        screen.getByRole("link", {
          name: "Nonprofit Terms of Use (October 2024)",
        })
      )
      .toHaveAttribute("href", "/terms-of-use-npo-2024");
  });

  test("the cut-off is midnight in New York, and the liability cap spares what is owed to the npo", async () => {
    const screen = await render_terms();
    const text = screen.container.textContent;

    expect(text).toContain(
      "made on or after 12:00 a.m. Eastern Time (America/New_York) on October 18, 2026."
    );
    expect(text).toContain(
      "THAT LIMIT DOES NOT APPLY TO ANY AMOUNT BETTER GIVING OWES YOU UNDER THIS AGREEMENT"
    );
  });
});
