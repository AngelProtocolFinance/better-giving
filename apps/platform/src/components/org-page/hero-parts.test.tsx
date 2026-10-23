import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, test } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { reset_viewport } from "#/__tests__/fixtures/viewport";
import { NAME_DISPLAY_MAX } from "@/org-shape";
import { BrandBand } from "./brand-band";
import { DonateButton, PinnedDonateBar } from "./donate";
import { OrgBanner } from "./org-banner";
import { OrgMark } from "./org-mark";
import { OrgMeta } from "./org-meta";
import { OrgName } from "./org-name";
import { RaisedStats } from "./raised-stats";

// a real 1x1 pixel, so the img stays mounted rather than falling back
const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

afterEach(async () => {
  await cleanup();
  await reset_viewport();
  window.scrollTo(0, 0);
});

describe("org hero", () => {
  test("a banner shows at 4:1 and an org without one gets no strip", async () => {
    await page.viewport(1280, 900);
    const screen = await render(<OrgBanner src={PIXEL} />);
    const img = screen.container.querySelector("img") as HTMLImageElement;
    expect(img).not.toBeNull();
    const box = img.getBoundingClientRect();
    expect(box.width / box.height).toBeCloseTo(4, 1);
    await cleanup();

    const none = await render(<OrgBanner src={null} />);
    expect(none.container.querySelector("img")).toBeNull();
    expect(none.container.textContent).toBe("");
  });

  test("the mark is the logo, or the name's first letter when there is none", async () => {
    const screen = await render(
      <>
        <OrgMark name="Riverside Literacy" logo={PIXEL} size="md" />
        <OrgMark name="(cliccs) Curtin Child" logo={null} size="lg" />
      </>
    );
    const marks = screen.container.children;
    expect(marks[0].tagName).toBe("IMG");
    expect(marks[0].hasAttribute("data-monogram")).toBe(false);
    // the letter, not the bracket, and uppercased
    expect(marks[1]).toHaveAttribute("data-monogram");
    expect(marks[1]).toHaveTextContent("C");
    expect(marks[1]).toHaveAttribute("aria-hidden", "true");
  });

  test("a name past the display length steps down a size and clamps at two lines", async () => {
    const fits = "x".repeat(NAME_DISPLAY_MAX);
    const long = "Curtin Child Learning Centre (CLICCS)";
    const screen = await render(
      <>
        <OrgName name={fits} scale="lg" />
        <OrgName name={long} scale="lg" />
      </>
    );
    const [short_h1, long_h1] = screen
      .getByRole("heading", { level: 1 })
      .elements();
    expect(short_h1).toHaveClass("text-4xl", "md:text-6xl");
    expect(short_h1).not.toHaveClass("line-clamp-2");
    expect(long_h1).toHaveClass("text-3xl", "md:text-5xl", "line-clamp-2");
    expect(long_h1).not.toHaveClass("md:text-6xl");
  });

  test("the meta line drops the 'Other' designation and a missing website, and strips the protocol", async () => {
    const screen = await render(
      <>
        <OrgMeta
          variant="eyebrow"
          npo={{
            endow_designation: "Charity",
            hq_country: "Kenya",
            url: "https://riverside.org/",
          }}
        />
        <OrgMeta
          variant="plain"
          npo={{ endow_designation: "Other", hq_country: "Peru", url: null }}
        />
      </>
    );
    const [full, bare] = screen.getByRole("list").elements();
    expect(full).toHaveTextContent("Charity·Kenya·riverside.org");
    const site = screen.getByRole("link", { name: "riverside.org" });
    await expect
      .element(site)
      .toHaveAttribute("href", "https://riverside.org/");
    expect(bare).toHaveTextContent("Peru");
    expect(bare).not.toHaveTextContent("Other");
    expect(bare.querySelectorAll("li")).toHaveLength(1);
  });
});

describe("raised stats", () => {
  test("$0 raised asks for the first gift instead of showing the figures", async () => {
    const screen = await render(
      <RaisedStats raised={0} donors={0} target={undefined} variant="inline" />
    );
    await expect
      .element(screen.getByText("Be the first to give"))
      .toBeVisible();
    expect(screen.container).not.toHaveTextContent("$0");
    expect(screen.getByRole("progressbar").query()).toBeNull();
  });

  test("figures name the donors only when the count is known, and a goal adds the bar and the percent", async () => {
    const screen = await render(
      <>
        <RaisedStats
          raised={3322}
          donors={49}
          target={undefined}
          variant="inline"
        />
        <RaisedStats
          raised={3322}
          donors={null}
          target="8000"
          variant="panel"
        />
      </>
    );
    const [inline, panel] = Array.from(screen.container.children);
    expect(inline).toHaveTextContent("$3,322 raised · 49 donors");
    expect(inline.querySelector("[role=progressbar]")).toBeNull();

    expect(panel).not.toHaveTextContent("donor");
    const bar = screen.getByRole("progressbar");
    await expect.element(bar).toHaveAttribute("aria-valuenow", "3322");
    await expect.element(bar).toHaveAttribute("aria-valuemax", "8000");
    expect(panel.textContent).toContain("41% of $8,000 goal");
  });
});

describe("donate", () => {
  test("Donate inverts on a brand band, where the primary fill would vanish", async () => {
    const screen = await render(
      <MemoryRouter>
        <DonateButton to="/donate/7" />
        <BrandBand tone="deep">
          <DonateButton to="/donate/7" size="lg" />
        </BrandBand>
      </MemoryRouter>
    );
    const [plain, inverse] = screen
      .getByRole("link", { name: "Donate" })
      .elements();
    expect(plain).toHaveAttribute("href", "/donate/7");
    expect(plain).toHaveClass("btn-primary");
    expect(inverse).toHaveClass("bg-primary-fg", "text-primary", "btn-lg");
    expect(inverse).not.toHaveClass("btn-primary");
  });

  test("the pinned bar rides a phone's bottom edge, comes to rest under the footer, and is gone from md up", async () => {
    await page.viewport(375, 800);
    const screen = await render(
      <MemoryRouter>
        <div className="flex min-h-[100dvh] flex-col">
          <main className="h-[200dvh]" />
          <footer>
            <p>Registered charity 12-3456789</p>
          </footer>
          <PinnedDonateBar to="/donate/7" raised={3322} target="8000" />
        </div>
      </MemoryRouter>
    );
    const donate = screen.getByRole("link", { name: "Donate" });
    await expect.element(donate).toBeVisible();
    await expect.element(screen.getByText("41% of goal")).toBeVisible();
    const bar = donate.element().closest(".sticky") as HTMLElement;
    expect(bar).toHaveClass("md:hidden");
    expect(bar.getBoundingClientRect().bottom).toBeCloseTo(
      window.innerHeight,
      0
    );

    window.scrollTo(0, document.documentElement.scrollHeight);
    const last = screen.getByText("Registered charity").element();
    await expect
      .poll(() => last.getBoundingClientRect().bottom)
      .toBeLessThanOrEqual(bar.getBoundingClientRect().top);

    // hidden, a role query no longer finds it, so the bar is asked directly
    await page.viewport(1280, 900);
    await expect.poll(() => getComputedStyle(bar).display).toBe("none");
  });
});
