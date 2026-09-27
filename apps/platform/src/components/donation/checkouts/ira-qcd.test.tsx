import { ADDRESS, EIN, LEGAL_NAME } from "@better-giving/brand";
import { HttpResponse, http } from "msw";
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { mailto_fields } from "#/__tests__/fixtures/mailto";
import { mswWorker } from "#/setup-tests-browser";
import { emails } from "@/constants/common";
import type { IraQcdDonationDetails } from "../types";
import { IraQcdCheckout } from "./ira-qcd";

const PROFILE_URL = "https://test.example.com/marketplace/1";

const don_mock = vi.hoisted(() => ({
  recipient: { id: "1", name: "Boys & Girls Club #7 (100% volunteer)" },
  source: "bg-marketplace",
  mode: "live",
  config: null,
  base_url: "https://test.example.com",
}));
const don_set_mock = vi.hoisted(() => vi.fn());
vi.mock("../context", () => ({
  use_donation: vi
    .fn()
    .mockReturnValue({ don: don_mock, don_set: don_set_mock }),
}));
const NAME = don_mock.recipient.name;

// 100 + a 10% tip → the custodian is asked for $110.00
const fv: IraQcdDonationDetails = {
  amount: "100",
  tip: "",
  tip_format: "10",
  custodian: "Fidelity",
};

describe("ira qcd checkout", () => {
  test("a recipient named with &, # and % reaches the custodian email whole", async () => {
    const screen = await render(<IraQcdCheckout {...fv} />);

    const email = screen.getByRole("link", { name: /generate email/i });
    await expect.element(email).toHaveAttribute("href");
    const fields = mailto_fields((email.element() as HTMLAnchorElement).href);

    expect(fields.get("subject")).toBe(
      `IRA charitable donation to Better Giving supporting ${NAME}`
    );
    expect(fields.get("body")?.split("\r\n")).toEqual(
      expect.arrayContaining([
        `I would like to request a Qualified Charitable Distribution (QCD) from my IRA to support ${NAME} (${PROFILE_URL}).`,
        `Payee name: ${LEGAL_NAME}`,
        `EIN: ${EIN}`,
        `Mailing address: ${ADDRESS}`,
        `Reference: ${NAME} (${PROFILE_URL})`,
        "Amount: $110.00",
        "Thank you.",
      ])
    );
    expect(fields.get("cc")).toBe(emails.hi);
  });

  const refuse = (body: object) =>
    mswWorker.use(
      http.post("*/api/donation-notifications", () =>
        HttpResponse.json(body, { status: 400 })
      )
    );
  const notify = (screen: Awaited<ReturnType<typeof render>>) =>
    screen
      .getByRole("button", { name: /i've submitted my ira request/i })
      .click();

  test("a custodian the server refuses says why, and Edit custodian goes back to the form", async () => {
    const reason = "Enter the firm's name, not a web address";
    refuse({ ok: false, errors: { custodian: reason } });
    const screen = await render(<IraQcdCheckout {...fv} />);

    await notify(screen);
    const edit = screen.getByRole("button", { name: "Edit custodian" });
    await expect.element(edit).toHaveFocus();
    await expect
      .element(screen.getByText(`IRA provider / custodian: ${reason}`))
      .toBeVisible();
    expect(screen.getByText(/something went wrong/i).query()).toBeNull();

    await edit.click();
    const set = don_set_mock.mock.calls.at(-1)?.[0];
    expect(set({ ...don_mock, method: "ira_qcd" })).toMatchObject({
      ira_qcd: { step: "form", fv },
    });
  });

  test("a refusal naming no field keeps the generic error", async () => {
    refuse({ ok: false });
    const screen = await render(<IraQcdCheckout {...fv} />);

    await notify(screen);
    await expect
      .element(screen.getByText(/something went wrong/i))
      .toBeVisible();
    expect(
      screen.getByRole("button", { name: "Edit custodian" }).query()
    ).toBeNull();
  });
});
