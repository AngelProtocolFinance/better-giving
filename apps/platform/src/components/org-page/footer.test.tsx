import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, test } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { reset_viewport } from "#/__tests__/fixtures/viewport";
import { type IOrgDetails, OrgFooter, OrgFooterMinimal } from "./footer";

afterEach(async () => {
  await cleanup();
  await reset_viewport();
});

function mount(
  details?: IOrgDetails,
  social_media_urls: { facebook?: string } | null = null
) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <OrgFooter
          name="Acme Relief"
          logo={null}
          social_media_urls={social_media_urls}
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

  test("a phone puts the details, heading shown, above the accounts; wider screens put them under", async () => {
    const top = (el: Element) => el.getBoundingClientRect().top;
    const details = { registration_number: "12-3456789" };
    const socials = { facebook: "https://facebook.com/acme" };

    await page.viewport(375, 667);
    const phone = await mount(details, socials);
    const heading = phone.getByRole("heading", {
      name: "Organization details",
    });
    await expect.element(heading).toBeVisible();
    expect(heading.element().getBoundingClientRect().height).toBeGreaterThan(1);
    const fb = phone.getByRole("link", { name: "Facebook", exact: true });
    expect(top(phone.getByText("12-3456789").element())).toBeLessThan(
      top(fb.element())
    );
    await cleanup();

    await page.viewport(1280, 900);
    const wide = await mount(details, socials);
    // still the region's name, drawn for assistive tech only
    const region = wide.getByRole("region", { name: "Organization details" });
    await expect.element(region.getByText("12-3456789")).toBeVisible();
    expect(
      wide
        .getByRole("heading", { name: "Organization details" })
        .element()
        .getBoundingClientRect().height
    ).toBeLessThanOrEqual(1);
    const wide_fb = wide.getByRole("link", { name: "Facebook", exact: true });
    expect(top(wide_fb.element())).toBeLessThan(
      top(wide.getByText("12-3456789").element())
    );
  });

  test("the minimal variant is the platform credit alone", async () => {
    const Stub = createRoutesStub([
      { path: "/", Component: () => <OrgFooterMinimal /> },
    ]);
    const screen = await render(<Stub initialEntries={["/"]} />);
    const footer = screen.getByRole("contentinfo");
    await expect
      .element(footer.getByRole("link", { name: "Powered by Better Giving" }))
      .toHaveAttribute("href", "/");
    expect(footer.getByRole("link").elements()).toHaveLength(1);
    expect(footer.getByRole("heading").query()).toBeNull();
    expect(footer.getByRole("img").query()).toBeNull();
  });
});
