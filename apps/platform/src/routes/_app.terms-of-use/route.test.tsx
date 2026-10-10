import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import TermsDonors from "./route";

const Stub = createRoutesStub([
  { path: "/terms-of-use", Component: TermsDonors },
]);

describe("donor terms", () => {
  test("Control of Funds voids a reversed gift's receipt, under the effective date", async () => {
    const screen = await render(<Stub initialEntries={["/terms-of-use"]} />);

    await expect
      .element(
        screen.getByText("Effective October 16, 2026", {
          exact: true,
        })
      )
      .toBeVisible();

    const control = screen
      .getByText("Control of Funds", { exact: true })
      .element()
      .closest("li");
    expect(control?.textContent).toContain(
      "A donation that is refunded, reversed or charged back is not a charitable contribution, and any acknowledgment or receipt issued for it is void."
    );
  });
});
