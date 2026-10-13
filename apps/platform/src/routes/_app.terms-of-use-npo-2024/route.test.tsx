import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import TermsNonprofits2024 from "./route";

const Stub = createRoutesStub([
  { path: "/terms-of-use-npo-2024", Component: TermsNonprofits2024 },
]);

describe("prior nonprofit terms", () => {
  test("keep the October 2024 text, say when it stopped applying and link the current one", async () => {
    const screen = await render(
      <Stub initialEntries={["/terms-of-use-npo-2024"]} />
    );

    await expect
      .element(screen.getByText("Effective October 25, 2024", { exact: true }))
      .toBeVisible();
    expect(screen.container.textContent).toContain(
      "effective from October 25, 2024 until October 18, 2026"
    );
    expect(screen.container.textContent).toContain(
      "All changes are effective immediately when we post them."
    );
    expect(screen.container.textContent).not.toContain("Recovery Amount");
    await expect
      .element(screen.getByRole("link", { name: "Nonprofit Terms of Use" }))
      .toHaveAttribute("href", "/terms-of-use-npo");
  });
});
