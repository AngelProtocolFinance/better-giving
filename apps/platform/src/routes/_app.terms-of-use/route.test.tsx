import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import TermsDonors from "./route";

const Stub = createRoutesStub([
  { path: "/terms-of-use", Component: TermsDonors },
]);

const item = async (title: string) => {
  const screen = await render(<Stub initialEntries={["/terms-of-use"]} />);
  return {
    screen,
    text:
      screen.getByText(title, { exact: true }).element().closest("li")
        ?.textContent ?? "",
  };
};

describe("donor terms", () => {
  test("Control of Funds offers a corrected receipt for a reversed gift, partial refunds included, under the effective date", async () => {
    const { screen, text } = await item("Control of Funds");

    await expect
      .element(
        screen.getByText("Effective October 23, 2026", {
          exact: true,
        })
      )
      .toBeVisible();
    expect(text).toContain(
      "Better Giving may, in its sole discretion, refund all or part of a donation"
    );
    expect(text).toContain(
      "that receipt does not cover the amount returned to you, and Better Giving will, on request, issue you a corrected receipt showing the amount Better Giving kept, if any (for a partial refund, the original amount less the amount returned to you)"
    );
    expect(text).not.toContain("void");
  });

  test("the refund item that Disputed Payments cites as Section 1(a) is Control of Funds", async () => {
    const { screen, text } = await item("Disputed Payments");
    const first = screen.container.querySelector(
      "main > ol > li > ol > li:first-child"
    );

    expect(text).toContain("refunded under Section 1(a)");
    expect(first?.textContent?.startsWith("Control of Funds")).toBe(true);
    expect(first?.textContent).toContain("corrected receipt");
  });

  test("Control of Funds names the receipt it will reissue, on request", async () => {
    const { text } = await item("Control of Funds");

    expect(text).toContain(
      "Better Giving will, on request, issue you a corrected receipt"
    );
    expect(text).toContain(
      "that receipt does not cover the amount returned to you"
    );
  });

  test("Disputed Payments: a win or a withdrawal keeps the receipt, a reopened win recovers again", async () => {
    const { text } = await item("Disputed Payments");

    expect(text).toContain(
      "If the dispute is resolved in Better Giving’s favor, or you withdraw it, or it closes without the payment being reversed, the donation stands as a charitable contribution and your original receipt remains valid."
    );
    expect(text).toContain(
      "If you keep all or part of the disputed amount, that amount is treated as refunded under Section 1(a)"
    );
    expect(text).toContain(
      "If a dispute that closed in Better Giving’s favor is later reopened, appealed or reversed"
    );
  });

  test("a revision takes effect seven days after posting, not immediately", async () => {
    const screen = await render(<Stub initialEntries={["/terms-of-use"]} />);
    const text = (
      screen.getByText(/^We may revise and update these Terms/).element()
        .textContent ?? ""
    ).replace(/\s+/g, " ");

    expect(text).toContain(
      "We may revise and update these Terms from time to time at our sole discretion. A change takes effect seven (7) days after we post it, unless the posting states a later date."
    );
    expect(screen.container.textContent).not.toContain("effective immediately");
  });
});
