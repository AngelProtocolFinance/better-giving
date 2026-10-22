import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { type IOrgDetails, OrgFooter } from "./footer";

afterEach(async () => {
  await cleanup();
});

function mount(details?: IOrgDetails) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <OrgFooter
          name="Acme Relief"
          logo={null}
          social_media_urls={null}
          details={details}
        />
      ),
    },
  ]);
  return render(<Stub initialEntries={["/"]} />);
}

describe("OrgFooter", () => {
  test("the details row shows each field it has and leaves out the empty ones", async () => {
    const screen = await mount({
      registration_number: "12-3456789",
      address: "",
      active_in: "Kenya, Uganda",
    });
    const details = screen.getByRole("region", {
      name: "Organization details",
    });
    await expect.element(details.getByText("EIN / Registration")).toBeVisible();
    await expect.element(details.getByText("12-3456789")).toBeVisible();
    await expect.element(details.getByText("Active in")).toBeVisible();
    await expect.element(details.getByText("Kenya, Uganda")).toBeVisible();
    expect(details.getByText("Address").query()).toBeNull();
  });

  test("no details row without details, or when every field is empty", async () => {
    const bare = await mount();
    await expect
      .element(bare.getByRole("link", { name: /Powered by Better Giving/ }))
      .toBeVisible();
    expect(bare.getByText("Organization details").query()).toBeNull();
    await cleanup();

    const blank = await mount({
      registration_number: null,
      address: null,
      active_in: null,
    });
    await expect
      .element(blank.getByRole("link", { name: /Powered by Better Giving/ }))
      .toBeVisible();
    expect(blank.getByText("Organization details").query()).toBeNull();
  });
});
