import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { CheckEmail } from "./check-email";
import { Expired } from "./expired";
import { InitForm } from "./init-form";
import { MigratedInfo } from "./migrated-info";
import { Success } from "./success";

/** a return path carrying every character raw interpolation mangles: `&`
 * splits the query, `#` starts a fragment, `%` is decoded a second time */
const RETURN_TO = "/donate/abc?frequency=monthly&amount=10%25#tip";

const screens = [
  ["init form", () => <InitForm to={RETURN_TO} />],
  ["check email", () => <CheckEmail email="d@example.com" to={RETURN_TO} />],
  [
    "migrated info",
    () => <MigratedInfo email="d@example.com" to={RETURN_TO} />,
  ],
  ["expired", () => <Expired email="d@example.com" to={RETURN_TO} />],
  ["success", () => <Success to={RETURN_TO} />],
] as const;

describe("reset screens' back-to-sign-in link", () => {
  test.each(screens)("%s hands /login the whole return path", async (_, C) => {
    const Stub = createRoutesStub([{ path: "/login/reset", Component: C }]);
    const screen = await render(<Stub initialEntries={["/login/reset"]} />);

    const link = screen.getByRole("link", { name: /back to sign in/i });
    await expect.element(link).toBeVisible();
    const to = new URL(
      (link.element() as HTMLAnchorElement).href,
      window.location.origin
    );
    expect(to.pathname).toBe("/login");
    expect(to.searchParams.get("redirect")).toBe(RETURN_TO);
  });
});
