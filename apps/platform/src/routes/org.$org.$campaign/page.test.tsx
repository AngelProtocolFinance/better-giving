import { createRoutesStub } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { CampaignPage, type ICampaignPage } from "./page";

function mount(props: ICampaignPage) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => <CampaignPage {...props} />,
      HydrateFallback: () => null,
    },
  ]);
  return render(<Stub initialEntries={["/"]} />);
}

function page(over: Partial<ICampaignPage> = {}): ICampaignPage {
  return {
    title: "Winter fuel for Harbor Clinic",
    org_name: "Harbor Clinic",
    org_href: "/marketplace/harbor",
    logo: null,
    tag: "Year-end",
    program_name: "Warmth fund",
    hero: null,
    hero_alt: "",
    story: { value: "" },
    videos: [],
    raised_line: "$1,200 raised of $8,000 goal",
    bar: { raised: 1200, goal: 8000 },
    donor_line: "18 donors · 12 days left",
    no_gifts: false,
    open: true,
    ended_body: null,
    donors: { id: "npo-1", campaign_id: "camp-1" },
    form: <p>Form body</p>,
    share: {
      recipientName: "Winter fuel for Harbor Clinic",
      url: "https://better.giving/org/harbor/winter",
    },
    ...over,
  };
}

describe("campaign page", () => {
  test("an open page shows Donate and Share and drops the old chrome", async () => {
    const screen = await mount(page());
    await expect
      .element(screen.getByRole("button", { name: "Donate", exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Share", exact: true }))
      .toBeVisible();
    expect(screen.getByText("About this campaign").query()).toBeNull();
    expect(screen.getByText("Spread the word!").query()).toBeNull();
    expect(screen.getByText(/Visit/).query()).toBeNull();
    expect(screen.getByText("Program:").query()).toBeNull();
    expect(screen.getByText(/%/).query()).toBeNull();
    expect(screen.getByText("Continue with Card").query()).toBeNull();
    expect(document.querySelector("[data-sticky]")).toBeNull();
  });

  test("Donate opens the dialog and Close returns focus", async () => {
    const screen = await mount(page());
    const donate = screen.getByRole("button", { name: "Donate", exact: true });
    await donate.click();
    const close = screen.getByRole("button", { name: "Close", exact: true });
    await expect.element(close).toBeVisible();
    await expect
      .element(screen.getByRole("dialog", { name: "Donate" }))
      .toBeVisible();
    expect(document.activeElement).toBe(close.element());
    await close.click();
    await expect
      .element(screen.getByRole("dialog", { name: "Donate" }))
      .not.toBeInTheDocument();
    expect(document.activeElement).toBe(donate.element());
  });

  test("Escape closes the dialog", async () => {
    const screen = await mount(page());
    await screen.getByRole("button", { name: "Donate", exact: true }).click();
    await expect
      .element(screen.getByRole("dialog", { name: "Donate" }))
      .toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect
      .element(screen.getByRole("dialog", { name: "Donate" }))
      .not.toBeInTheDocument();
  });

  test("an ended page keeps Share and drops Donate and the sticky surfaces", async () => {
    const screen = await mount(
      page({
        open: false,
        ended_body:
          "It no longer takes donations. Thank you to everyone who gave.",
        donor_line: "18 donors · Ended",
      })
    );
    expect(
      screen.getByRole("button", { name: "Donate", exact: true }).query()
    ).toBeNull();
    expect(document.querySelector("[data-sticky]")).toBeNull();
    await expect
      .element(screen.getByRole("button", { name: "Share", exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Giving has ended" }))
      .toBeVisible();
    await expect
      .element(
        screen.getByText(
          "It no longer takes donations. Thank you to everyone who gave."
        )
      )
      .toBeVisible();
  });

  test("sticky surfaces stay unmounted while Donate is in view", async () => {
    const screen = await mount(page());
    await expect
      .element(screen.getByRole("button", { name: "Donate", exact: true }))
      .toBeVisible();
    expect(document.querySelector("[data-sticky='header']")).toBeNull();
    expect(document.querySelector("[data-sticky='bar']")).toBeNull();
  });

  test("sticky surfaces mount once Donate leaves the viewport", async () => {
    const seen: IntersectionObserverCallback[] = [];
    const Real = globalThis.IntersectionObserver;
    class StubIO implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = "";
      readonly thresholds = [0];
      constructor(cb: IntersectionObserverCallback) {
        seen.push(cb);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    vi.stubGlobal("IntersectionObserver", StubIO);
    try {
      const screen = await mount(page());
      await vi.waitFor(() => expect(seen.length).toBeGreaterThan(0));
      expect(document.querySelector("[data-sticky]")).toBeNull();
      for (const cb of seen) {
        cb(
          [{ isIntersecting: false } as IntersectionObserverEntry],
          seen as unknown as IntersectionObserver
        );
      }
      await vi.waitFor(() => {
        expect(document.querySelector("[data-sticky='header']")).not.toBeNull();
        expect(document.querySelector("[data-sticky='bar']")).not.toBeNull();
      });
      await expect
        .element(
          screen.getByRole("heading", { name: "Winter fuel for Harbor Clinic" })
        )
        .toBeVisible();
    } finally {
      vi.stubGlobal("IntersectionObserver", Real);
    }
  });

  test("initial_dialog_open paints the dialog open", async () => {
    const screen = await mount(page({ initial_dialog_open: true }));
    await expect
      .element(screen.getByRole("dialog", { name: "Donate" }))
      .toBeVisible();
    await expect.element(screen.getByText("Form body")).toBeVisible();
  });

  test("a website renders on the legal line without a legal string", async () => {
    const screen = await mount(
      page({
        website: { href: "https://harbor.example", label: "harbor.example" },
      })
    );
    const link = screen.getByRole("link", { name: "harbor.example" });
    await expect.element(link).toBeVisible();
    expect(link.element().getAttribute("href")).toBe("https://harbor.example");
    expect(link.element().className).toContain("underline");
    expect(link.element().className).toContain("font-semibold");
    expect(link.element().parentElement?.textContent).toBe("harbor.example");
  });

  test("legal text renders without a website", async () => {
    const screen = await mount(page({ legal: "501(c)(3) · EIN 12-3456789" }));
    await expect
      .element(screen.getByText("501(c)(3) · EIN 12-3456789"))
      .toBeVisible();
    expect(
      screen.getByRole("link", { name: "harbor.example" }).query()
    ).toBeNull();
  });

  test("legal text and a website share one line", async () => {
    const screen = await mount(
      page({
        legal: "501(c)(3) · EIN 12-3456789",
        website: { href: "https://harbor.example", label: "harbor.example" },
      })
    );
    const link = screen.getByRole("link", { name: "harbor.example" });
    await expect.element(link).toBeVisible();
    expect(link.element().parentElement?.textContent).toBe(
      "501(c)(3) · EIN 12-3456789 · harbor.example"
    );
  });
});
