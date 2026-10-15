import { createRoutesStub } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";

vi.mock("@/terms", async (io) => ({
  ...(await io<typeof import("@/terms")>()),
  TERMS_EFFECTIVE: "2027-03-05",
}));

import TermsDonors from "#/routes/_app.terms-of-use/route";
import TermsNonprofits from "#/routes/_app.terms-of-use-npo/route";
import TermsNonprofits2024 from "#/routes/_app.terms-of-use-npo-2024/route";
import TermsReferrals from "#/routes/_app.terms-of-use-referrals/route";
import { TERMS_ZONE } from "@/terms";

describe("terms pages", () => {
  test.each([
    {
      name: "nonprofit",
      page: TermsNonprofits,
      effective_line: "Effective March 5, 2027",
      n: 2,
      cutoff: `the later of (i) 12:00 a.m. Eastern Time (${TERMS_ZONE}) on March 5, 2027 and (ii) the date these Terms take effect under Section 9(d).`,
    },
    {
      name: "donor",
      page: TermsDonors,
      effective_line: "Effective March 5, 2027",
      n: 1,
    },
    {
      name: "referral",
      page: TermsReferrals,
      effective_line: "Effective Date: March 5, 2027",
      n: 2,
      cutoff: `the later of (i) 12:00 a.m. Eastern Time (${TERMS_ZONE}) on March 5, 2027 and (ii) the date these revised Program Terms take effect.`,
    },
    {
      // its own date is the archived one; only "until <date>" follows
      name: "2024 nonprofit",
      page: TermsNonprofits2024,
      effective_line: "Effective October 25, 2024",
      n: 1,
    },
  ])(
    "$name terms date every line from TERMS_EFFECTIVE",
    async ({ page, effective_line, n, cutoff }) => {
      const Stub = createRoutesStub([{ path: "/", Component: page }]);
      const screen = await render(<Stub />);

      await expect
        .element(screen.getByText(effective_line, { exact: true }))
        .toBeVisible();
      expect(screen.container.textContent?.split("March 5, 2027").length).toBe(
        n + 1
      );
      if (cutoff) expect(screen.container.textContent).toContain(cutoff);
    }
  );
});
