import { createRoutesStub } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";

// the route module re-exports its server loader/action, which pull the whole
// auth + nodemailer tree into the browser bundle. the stub supplies both, so
// only the component under test has to evaluate.
vi.mock("./api", () => ({ action: vi.fn() }));
vi.mock("../_app.signup/loader", () => ({ loader: vi.fn() }));

import SignupPage from "./route";

/** the loader hands the page the `to` it will return to after signup, and that
 *  string is the only thing choosing which terms the acceptance line names. */
async function render_signup(to: string) {
  const Stub = createRoutesStub([
    { path: "/signup", Component: SignupPage, loader: () => to },
  ]);
  return render(<Stub initialEntries={["/signup"]} />);
}

describe("signup — the acceptance line links what it names", () => {
  // label and href both come from the context's own `terms` entry. a hardcoded
  // href means a nonprofit accepts a document it is never shown a route to.
  test.each([
    ["/register/abc", "Terms of Use (Nonprofits)", "/terms-of-use-npo"],
    [
      "/dashboard/referrals",
      "Terms of Use (Referrals)",
      "/terms-of-use-referrals",
    ],
    ["/marketplace", "Terms of Use (Donors)", "/terms-of-use"],
  ])("%s → %s", async (to, title, expected_href) => {
    const screen = await render_signup(to);

    await expect
      .element(screen.getByRole("link", { name: title, exact: true }))
      .toHaveAttribute("href", expected_href);
  });
});
