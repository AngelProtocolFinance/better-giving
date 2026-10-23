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

// a legacy 3:1 logo, as an older upload could be
const WIDE_LOGO = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="10"><rect width="30" height="10" fill="teal"/></svg>'
)}`;

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

  test("a 3:1 logo is fitted whole in the same square frame the monogram takes", async () => {
    const screen = await render(
      <>
        <OrgMark name="Curtin Child" logo={WIDE_LOGO} size="md" />
        <OrgMark name="Curtin Child" logo={null} size="md" />
      </>
    );
    const [logo, monogram] = Array.from(screen.container.children);
    const img = logo as HTMLImageElement;
    await expect.poll(() => img.complete && img.naturalWidth > 0).toBe(true);
    expect(img.naturalWidth / img.naturalHeight).toBeCloseTo(3, 1);

    const frame = img.getBoundingClientRect();
    expect(frame.width).toBe(frame.height);
    expect(monogram.getBoundingClientRect().toJSON()).toMatchObject({
      width: frame.width,
      height: frame.height,
    });
    // the system's corner, not a circle that would cut the wide logo's ends
    for (const el of [img, monogram]) {
      expect(getComputedStyle(el).borderRadius).toBe("4px");
    }

    // contain draws the 3:1 picture at the frame's full width and a third of
    // its height, so all of it sits inside the square; cover would cut its ends
    expect(getComputedStyle(img).objectFit).toBe("contain");
  });

  test("a name past the display length steps down a size and wraps in full", async () => {
    await page.viewport(375, 812);
    const fits = "x".repeat(NAME_DISPLAY_MAX);
    // 70 characters: three lines and more on a phone
    const long =
      "The Curtin Child Learning Centre for Literacy and Numeracy (CLICCS) WA";
    expect(long).toHaveLength(70);
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
    expect(long_h1).toHaveClass("text-3xl", "md:text-5xl");
    expect(long_h1).not.toHaveClass("md:text-6xl");

    const s = getComputedStyle(long_h1);
    expect(s.webkitLineClamp).toBe("none");
    // nothing hidden past its box; scrollHeight rounds a fractional line up
    expect(long_h1.scrollHeight - long_h1.clientHeight).toBeLessThanOrEqual(1);
    const lines = long_h1.clientHeight / Number.parseFloat(s.lineHeight);
    expect(Math.round(lines)).toBeGreaterThan(2);
  });

  test("the meta row: the designation as a badge, the country, the website by its host, and the registration; 'Other' and missing facts left out", async () => {
    const screen = await render(
      <>
        <OrgMeta
          npo={{
            endow_designation: "Charity",
            hq_country: "Kenya",
            url: "https://www.riverside.org/about/team",
          }}
          credential={{ label: "EIN", value: "12-3456789" }}
        />
        <OrgMeta
          npo={{ endow_designation: "Other", hq_country: "Peru", url: null }}
          credential={null}
        />
      </>
    );
    const [full, bare] = screen.getByRole("list").elements();
    const items = Array.from(full.querySelectorAll("li"));
    expect(items.map((li) => li.textContent)).toEqual([
      "Charity",
      "Kenya",
      "www.riverside.org",
      "EIN 12-3456789",
    ]);
    expect(items[0].firstElementChild).toHaveAttribute(
      "data-tone",
      "secondary"
    );
    for (const li of items.slice(1)) {
      expect(li.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    }
    expect(full.textContent).not.toContain("·");
    const site = screen.getByRole("link", {
      name: "www.riverside.org",
      exact: true,
    });
    await expect
      .element(site)
      .toHaveAttribute("href", "https://www.riverside.org/about/team");
    await expect.element(site).toHaveAttribute("target", "_blank");
    expect(bare).toHaveTextContent("Peru");
    expect(bare).not.toHaveTextContent("Other");
    expect(bare.querySelectorAll("li")).toHaveLength(1);
  });

  test("on the brand fill the badge takes the on-primary tone and the row the band's ink", async () => {
    const screen = await render(
      <BrandBand tone="primary">
        <OrgMeta
          npo={{ endow_designation: "Charity", hq_country: "Kenya", url: null }}
          credential={null}
        />
      </BrandBand>
    );
    const list = screen.getByRole("list").element();
    expect(list).not.toHaveClass("text-gray-11");
    expect(list.querySelector("[data-tone]")).toHaveAttribute(
      "data-tone",
      "on-primary"
    );
  });

  test("a meta row that wraps on a phone keeps each glyph on its item's first line", async () => {
    await page.viewport(375, 812);
    const screen = await render(
      <div style={{ width: 200 }}>
        <OrgMeta
          npo={{
            endow_designation: "Charity",
            hq_country: "Democratic Republic of the Congo",
            url: "https://www.harborvalleyfood.org",
          }}
          credential={{ label: "Registration no.", value: "CH-0042" }}
        />
      </div>
    );
    const list = screen.getByRole("list").element() as HTMLElement;
    const items = Array.from(list.querySelectorAll("li"));
    const tops = items.map((li) => li.getBoundingClientRect().top);
    expect(new Set(tops).size).toBeGreaterThan(1);
    expect(list.scrollWidth).toBeLessThanOrEqual(list.clientWidth);
    // the country wraps inside its item; its glyph sits on the first line
    const country = items[1];
    const text = country.lastElementChild as HTMLElement;
    const line = Number.parseFloat(getComputedStyle(text).lineHeight);
    expect(text.getBoundingClientRect().height).toBeGreaterThan(line);
    const glyph = (
      country.querySelector("svg") as SVGElement
    ).getBoundingClientRect();
    expect(glyph.bottom).toBeLessThanOrEqual(
      text.getBoundingClientRect().top + line
    );
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

  test("figures are pairs, a figure over its label, the donors only when the count is known; a goal adds the bar and the goal in dollars", async () => {
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
    const pairs = Array.from(inline.querySelectorAll("p"));
    expect(pairs.map((p) => p.textContent)).toEqual([
      "$3,322 raised",
      "49 donors",
    ]);
    for (const p of pairs) {
      const [figure, label] = Array.from(p.children);
      expect(figure.tagName).toBe("STRONG");
      // the figure over its label
      expect(figure.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        label.getBoundingClientRect().top
      );
    }
    expect(inline.textContent).not.toContain("·");
    expect(inline.querySelector("[role=progressbar]")).toBeNull();

    expect(panel).not.toHaveTextContent("donor");
    expect(panel.querySelector("strong")).toHaveTextContent("$3,322");
    const bar = screen.getByRole("progressbar");
    await expect.element(bar).toHaveAttribute("aria-valuenow", "3322");
    await expect.element(bar).toHaveAttribute("aria-valuemax", "8000");
    expect(panel.textContent).toContain("$3,322 of $8,000 goal");
    expect(panel.textContent).not.toContain("%");
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
          <PinnedDonateBar to="/donate/7" raised={3322} />
        </div>
      </MemoryRouter>
    );
    const donate = screen.getByRole("link", { name: "Donate" });
    await expect.element(donate).toBeVisible();
    await expect.element(screen.getByText("$3,322 raised")).toBeVisible();
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
