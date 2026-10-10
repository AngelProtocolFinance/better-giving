import { createRoutesStub } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";

vi.mock("@/terms", async (io) => ({
  ...(await io<typeof import("@/terms")>()),
  TERMS_EFFECTIVE: "2027-03-05",
}));

import TermsDonors from "#/routes/_app.terms-of-use/route";
import TermsNonprofits from "#/routes/_app.terms-of-use-npo/route";
import TermsReferrals from "#/routes/_app.terms-of-use-referrals/route";

describe("terms pages", () => {
  test.each([
    {
      name: "nonprofit",
      page: TermsNonprofits,
      effective_line: "Effective March 5, 2027",
      n: 2,
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
    },
  ])(
    "$name terms date every line from TERMS_EFFECTIVE",
    async ({ page, effective_line, n }) => {
      const Stub = createRoutesStub([{ path: "/", Component: page }]);
      const screen = await render(<Stub />);

      await expect
        .element(screen.getByText(effective_line, { exact: true }))
        .toBeVisible();
      expect(screen.container.textContent?.split("March 5, 2027").length).toBe(
        n + 1
      );
    }
  );
});
