import { ADDRESS, EIN, LEGAL_NAME } from "@better-giving/brand";
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { mailto_fields } from "#/__tests__/fixtures/mailto";
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
vi.mock("../context", () => ({
  use_donation: vi.fn().mockReturnValue({ don: don_mock, don_set: vi.fn() }),
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
});
