import type { ReactNode } from "react";
import { createRoutesStub } from "react-router";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
// the pre-paint dismissed state is expressed in css (an arbitrary variant keyed
// off the <html> attribute the root-layout script sets), so the real stylesheet
// must be loaded for that case to be observable.
import "#/index.css";
import { AnnouncementBanner, KEY } from "./announcement-banner";
import { PublicLayout } from "./public-layout";

// deliberately a literal, not derived from BANNER_POST_SLUG — this pins the
// url the campaign was launched with, so a slug rename is a visible decision
// rather than a test that silently follows it.
const POST_PATH = "/blog/setting-a-new-standard-for-digital-giving";
const COPY =
  /Better Giving endorses the National Council for Nonprofits Principles for Ethical Online Fundraising/;

function stub(Page: () => ReactNode) {
  return createRoutesStub([
    { path: "/", Component: Page, HydrateFallback: () => null },
    { path: "/blog/:slug", Component: () => <p>blog post page</p> },
  ]);
}

function Bare() {
  return <AnnouncementBanner />;
}

// replica of PublicLayout's shell: four declared row tracks fed by four
// children in order. grid auto-placement assigns tracks to boxes, so a banner
// that stops generating one slides the header into the `auto` track and the
// outlet into the header's 4rem track.
function GridPage() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] grid-rows-[auto_4rem_minmax(calc(100dvh-4rem),1fr)_auto]">
      <AnnouncementBanner />
      <div data-testid="header" className="h-full" />
      <div data-testid="outlet" />
      <div data-testid="footer" />
    </div>
  );
}

// the real PublicLayout behind a stub router: parent route + children, so the
// gate reads a real pathname and the assertions run against the shipped grid
// template rather than a copy of it.
function layout_stub() {
  return createRoutesStub([
    {
      path: "/",
      Component: PublicLayout,
      HydrateFallback: () => null,
      children: [
        { index: true, Component: () => <p>home page</p> },
        { path: "about-us", Component: () => <p>about page</p> },
        { path: "login", Component: () => <p>login page</p> },
        { path: "blog/:slug", Component: () => <p>blog post page</p> },
      ],
    },
  ]);
}

// resolved row tracks of the layout's grid container, in px. the count is what
// discriminates the two templates (4 tracks with the banner, 3 without) and
// the header track proves the 4rem value survived.
function row_tracks(container: HTMLElement) {
  const header = container.querySelector("header");
  const grid = header?.parentElement;
  if (!grid) throw new Error("layout grid not found");
  return getComputedStyle(grid).gridTemplateRows.split(" ");
}

function root(container: HTMLElement) {
  return container.querySelector<HTMLElement>(
    '[data-banner="ncnp-endorsement"]'
  );
}

function height(el: Element) {
  return el.getBoundingClientRect().height;
}

// what the pre-paint script in root-layout does for a returning visitor
function pre_dismissed() {
  localStorage.setItem(KEY, "1");
  document.documentElement.dataset.bannerDismissed = "ncnp-endorsement";
}

beforeEach(() => {
  localStorage.removeItem(KEY);
  document.documentElement.removeAttribute("data-banner-dismissed");
});

afterEach(() => {
  localStorage.removeItem(KEY);
  document.documentElement.removeAttribute("data-banner-dismissed");
});

describe("AnnouncementBanner", () => {
  test("shows the endorsement copy linking to the post, and dismissing empties it without navigating", async () => {
    const Stub = stub(Bare);
    const screen = await render(
      <Stub initialEntries={["/"]} future={{ v8_middleware: true }} />
    );

    await expect.element(screen.getByText(COPY)).toBeVisible();

    const link = screen.getByRole("link", { name: /find out more/i });
    await expect.element(link).toBeVisible();
    expect(link.element().getAttribute("href")).toBe(POST_PATH);

    await screen.getByRole("button", { name: /dismiss/i }).click();

    // persisted for the pre-paint script on the next document load
    expect(localStorage.getItem(KEY)).toBe("1");
    // and set on <html> so the css path agrees with react state in this tick
    expect(document.documentElement.dataset.bannerDismissed).toBe(
      "ncnp-endorsement"
    );
    // content gone immediately, in the same tick...
    await expect.element(screen.getByText(COPY)).not.toBeInTheDocument();
    // ...but the outer box stays, collapsed, so the caller's grid keeps its row
    const el = root(screen.container);
    expect(el).not.toBeNull();
    expect(height(el as HTMLElement)).toBe(0);
    // the dismiss click must not reach the link
    await expect
      .element(screen.getByText("blog post page"))
      .not.toBeInTheDocument();
  });

  test("only the link text navigates — clicking the bar around it does nothing", async () => {
    const Stub = stub(Bare);
    const screen = await render(
      <Stub initialEntries={["/"]} future={{ v8_middleware: true }} />
    );

    const el = root(screen.container) as HTMLElement;
    const box = el.getBoundingClientRect();
    // the bar's left padding — empty space, nowhere near the visible link text.
    // hit-testing attributes a pseudo-element to the element that owns it, so a
    // link stretched over the bar with `after:inset-0` surfaces here as the <a>.
    const target = document.elementFromPoint(
      box.left + 2,
      box.top + box.height / 2
    );
    expect(target?.closest("a")).toBeNull();
    (target as HTMLElement).click();

    // asserting the absence of a navigation directly would pass while one is
    // still in flight. clicking the real link afterwards is what makes the
    // first click's result observable: it can only be found if the bar is
    // still mounted, and its own navigation proves the harness sees them.
    await screen.getByRole("link", { name: /find out more/i }).click();
    await expect.element(screen.getByText("blog post page")).toBeVisible();
  });

  test("collapses to zero height but keeps its box when the pre-paint script marked it dismissed", async () => {
    pre_dismissed();

    const Stub = stub(Bare);
    const screen = await render(
      <Stub initialEntries={["/"]} future={{ v8_middleware: true }} />
    );

    // markup is always rendered (no mount-effect gate => no layout shift);
    // the <html> attribute is what empties it.
    const el = root(screen.container);
    expect(el).not.toBeNull();
    expect(height(el as HTMLElement)).toBe(0);
    await expect.element(screen.getByText(COPY)).not.toBeVisible();
  });

  test("keeps the caller's grid tracks aligned when pre-dismissed", async () => {
    pre_dismissed();

    const Stub = stub(GridPage);
    const screen = await render(
      <Stub initialEntries={["/"]} future={{ v8_middleware: true }} />
    );

    // the header stub has no intrinsic height, so 64px proves it landed in the
    // declared 4rem track instead of sliding up into the banner's `auto` one.
    expect(height(screen.getByTestId("header").element())).toBe(64);
  });

  test("keeps the caller's grid tracks aligned after an in-session dismiss", async () => {
    const Stub = stub(GridPage);
    const screen = await render(
      <Stub initialEntries={["/"]} future={{ v8_middleware: true }} />
    );

    expect(height(screen.getByTestId("header").element())).toBe(64);

    await screen.getByRole("button", { name: /dismiss/i }).click();

    expect(height(screen.getByTestId("header").element())).toBe(64);
  });
});

describe("PublicLayout banner gate", () => {
  test("the homepage shows the bar", async () => {
    const Stub = layout_stub();
    const screen = await render(
      <Stub initialEntries={["/"]} future={{ v8_middleware: true }} />
    );

    await expect.element(screen.getByText("home page")).toBeInTheDocument();
    expect(root(screen.container)).not.toBeNull();
    expect(row_tracks(screen.container)).toHaveLength(4);
  });

  test("marketing route renders the bar in a fourth track above the 4rem header", async () => {
    const Stub = layout_stub();
    const screen = await render(
      <Stub initialEntries={["/about-us"]} future={{ v8_middleware: true }} />
    );

    await expect.element(screen.getByText("about page")).toBeInTheDocument();
    expect(root(screen.container)).not.toBeNull();

    const tracks = row_tracks(screen.container);
    // banner, header, outlet, footer — the header must still be the second
    // track at its declared 4rem, not shifted into the banner's `auto` one.
    expect(tracks).toHaveLength(4);
    expect(tracks[1]).toBe("64px");
  });

  test("non-marketing chrome gets neither the bar nor its track", async () => {
    const Stub = layout_stub();
    const screen = await render(
      <Stub initialEntries={["/login"]} future={{ v8_middleware: true }} />
    );

    await expect.element(screen.getByText("login page")).toBeInTheDocument();
    expect(root(screen.container)).toBeNull();

    const tracks = row_tracks(screen.container);
    // three children, three tracks: a fourth would leave the header in `auto`
    // and push the outlet into the 4rem track.
    expect(tracks).toHaveLength(3);
    expect(tracks[0]).toBe("64px");
  });

  test("the post the bar links to is marketing chrome but still suppresses it", async () => {
    const Stub = layout_stub();
    const screen = await render(
      <Stub initialEntries={[POST_PATH]} future={{ v8_middleware: true }} />
    );

    await expect
      .element(screen.getByText("blog post page"))
      .toBeInTheDocument();
    // marketing chrome, so only the slug check can be keeping it out
    expect(root(screen.container)).toBeNull();
    expect(row_tracks(screen.container)).toHaveLength(3);
  });

  test("suppression tolerates a trailing slash on the post path", async () => {
    const Stub = layout_stub();
    const screen = await render(
      <Stub
        initialEntries={[`${POST_PATH}/`]}
        future={{ v8_middleware: true }}
      />
    );

    expect(root(screen.container)).toBeNull();
  });
});

// no rendered assertion reaches root-layout's pre-paint head script, so its
// source is pinned; PublicLayout's own wiring is covered by the rendered
// assertions above.
const sources = import.meta.glob<string>(["/src/root-layout.tsx"], {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("campaign drift", () => {
  test("glob resolved the source", () => {
    expect(Object.keys(sources)).toEqual(["/src/root-layout.tsx"]);
  });

  test("the pre-paint script still reads the component's storage key", () => {
    // the head script must be a static string, so it can't import KEY. renaming
    // KEY without editing root-layout would silently kill pre-paint dismissal
    // with every other test still green.
    expect(sources["/src/root-layout.tsx"]).toContain(KEY);
  });

  test("the pre-paint script still writes the attribute the css variant reads", () => {
    expect(sources["/src/root-layout.tsx"]).toContain(
      'document.documentElement.dataset.bannerDismissed="ncnp-endorsement"'
    );
  });
});
