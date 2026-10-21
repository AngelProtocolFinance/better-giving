import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";

vi.mock("$/pg/db", () => ({ db: {} }));
vi.mock("#/.server/auth", () => ({
  admin_ctx: Symbol("admin"),
  user_ctx: Symbol("user"),
}));
vi.mock("#/.server/toast", async () => {
  const { redirect } = await import("react-router");
  return { redirectWithSuccess: (url: string) => redirect(url) };
});
vi.mock("$/kit/queue", () => ({ enqueue: vi.fn() }));

import { MAX_EXPIRATION_ISO } from "@/fundraiser/schema";
import EditPage from "../admin.$id.campaigns_.$campaign_id/route";
import NewPage from "../admin.$id.campaigns_.new/route";
import { CampaignForm, type ICampaignFormInit } from "./form";
import ListPage from "./route";

const NO_END = Date.parse(MAX_EXPIRATION_ISO) / 1000;

afterEach(async () => {
  await cleanup();
});

const init: ICampaignFormInit = {
  name: "Winter",
  slug: "winter",
  campaign_type: "",
  description_pt: "A story of the drive",
  banner: "",
  logo: "",
  videos: [],
  ends_at: null,
  target: undefined,
  increments: [],
  donate_methods: ["stripe"],
  donate_frequencies: ["one-time"],
  hide_bg_tip: true,
  program_id: null,
};

function form_page(
  status: "draft" | "live" | "ended" | null,
  extra?: { gift_count?: number; locked?: boolean }
) {
  let entered = false;
  let posted: unknown;
  const Stub = createRoutesStub([
    {
      path: "/admin/:id/campaigns/edit",
      Component: () => (
        <CampaignForm
          init={init}
          programs={[
            { id: "11111111-1111-4111-8111-111111111111", title: "Meals" },
          ]}
          locked={extra?.locked ?? false}
          status={status}
          gift_count={extra?.gift_count ?? 0}
          fallback_methods={["stripe"]}
          fallback_frequencies={["one-time"]}
          settings_donation_to="/admin/7/settings?tab=donation"
        />
      ),
      action: async ({ request }) => {
        // before await: a click that already submitted is visible while json() is pending
        entered = true;
        posted = await request.json();
        if (
          posted &&
          typeof posted === "object" &&
          "slug" in posted &&
          (posted as { slug?: string }).slug === "winter"
        ) {
          return {
            error: "That address is already used by another campaign.",
            field: "slug",
          };
        }
        return null;
      },
    },
    {
      path: "/admin/:id/settings",
      Component: () => <h1>Donation settings</h1>,
    },
  ]);
  return {
    posted: () => posted,
    entered: () => entered,
    Stub,
  };
}

async function render_form(
  status: "draft" | "live" | "ended" | null,
  extra?: { gift_count?: number; locked?: boolean }
) {
  const built = form_page(status, extra);
  const screen = await render(
    <built.Stub initialEntries={["/admin/7/campaigns/edit"]} />
  );
  return { screen, posted: built.posted, entered: built.entered };
}

function press(locator: { element: () => Element }) {
  (locator.element() as HTMLElement).click();
}

describe("campaign list", () => {
  const endow = { id: 7, slug: "acme" };

  async function render_list(
    campaigns: unknown[],
    org_funds: unknown[],
    supporter_funds: unknown[]
  ) {
    const Stub = createRoutesStub([
      {
        path: "/admin/:id/campaigns",
        Component: ListPage,
        loader: () => ({
          endow,
          campaigns,
          org_funds,
          supporter_funds,
          profile_to: "/admin/7/edit-profile",
        }),
      },
    ]);
    return render(<Stub initialEntries={["/admin/7/campaigns"]} />);
  }

  it("offers a create action when campaigns and funds are all absent", async () => {
    const screen = await render_list([], [], []);
    await expect.element(screen.getByText("No campaigns yet")).toBeVisible();
    const create = screen.getByRole("link", { name: "Create campaign" });
    expect((create.element() as HTMLAnchorElement).getAttribute("href")).toBe(
      "/admin/7/campaigns/new"
    );
    expect(
      screen.getByRole("heading", { name: "Supporter fundraisers" }).query()
    ).toBeNull();
  });

  it("omits the supporter heading when every fund belongs to the organization", async () => {
    const screen = await render_list(
      [
        {
          id: "c-draft",
          name: "Spring",
          slug: "spring",
          status: "draft",
          status_label: "draft",
          raised: 1,
          ends_at: null,
        },
      ],
      [
        {
          id: "f-owned",
          name: "Owned page",
          active: true,
          published: false,
          donation_total_usd: 3,
          expiration: NO_END,
        },
      ],
      []
    );
    await expect
      .element(
        screen.getByRole("heading", { name: "Your campaigns", level: 2 })
      )
      .toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Supporter fundraisers" }).query()
    ).toBeNull();
    expect(screen.getByText("No campaigns yet").query()).toBeNull();
    const section = screen
      .getByRole("heading", { name: "Your campaigns", level: 2 })
      .element().parentElement;
    const text = section?.textContent ?? "";
    expect(text.indexOf("Spring")).toBeGreaterThan(-1);
    expect(text.indexOf("Spring")).toBeLessThan(text.indexOf("Owned page"));
    const owned = screen.getByRole("link", { name: "Owned page" });
    expect((owned.element() as HTMLAnchorElement).pathname).toBe(
      "/fundraisers/f-owned/edit"
    );
  });

  it("omits the campaigns heading when only a supporter fund is present", async () => {
    const screen = await render_list(
      [],
      [],
      [
        {
          id: "f-guest",
          name: "Guest page",
          active: true,
          published: false,
          donation_total_usd: 0,
          expiration: NO_END,
        },
      ]
    );
    expect(
      screen.getByRole("heading", { name: "Your campaigns", level: 2 }).query()
    ).toBeNull();
    await expect
      .element(screen.getByRole("heading", { name: "Supporter fundraisers" }))
      .toBeVisible();
    expect(screen.getByText("No campaigns yet").query()).toBeNull();
    const section = screen
      .getByRole("heading", { name: "Supporter fundraisers" })
      .element().parentElement;
    const guest = page
      .elementLocator(section as HTMLElement)
      .getByRole("link", { name: "Guest page" });
    expect((guest.element() as HTMLAnchorElement).pathname).toBe(
      "/fundraisers/f-guest"
    );
  });

  it("splits campaigns and supporter pages, and links the profile in the same tab", async () => {
    const screen = await render_list(
      [
        {
          id: "c-live",
          name: "Winter",
          slug: "winter",
          status: "live",
          status_label: "ended",
          raised: 12,
          ends_at: "2020-01-02T00:00:00.000Z",
        },
        {
          id: "c-draft",
          name: "Spring",
          slug: "spring",
          status: "draft",
          status_label: "draft",
          raised: 1,
          ends_at: null,
        },
      ],
      [],
      [
        {
          id: "f-ended",
          name: "Closed page",
          active: false,
          published: true,
          donation_total_usd: 4,
          expiration: NO_END,
        },
        {
          id: "f-draft",
          name: "Quiet page",
          active: true,
          published: false,
          donation_total_usd: 2,
          expiration: NO_END,
        },
        {
          id: "f-live",
          name: "Open page",
          active: true,
          published: true,
          donation_total_usd: 9,
          expiration: NO_END,
        },
      ]
    );

    expect(screen.getByText("No campaigns yet").query()).toBeNull();
    await expect
      .element(screen.getByRole("heading", { name: "Supporter fundraisers" }))
      .toBeVisible();

    const winter = screen.getByRole("link", { name: "Winter", exact: true });
    expect((winter.element() as HTMLAnchorElement).pathname).toBe(
      "/admin/7/campaigns/c-live"
    );
    await expect
      .element(screen.getByText("Ended · $12 raised · Jan 2, 2020"))
      .toBeVisible();
    const winter_row = (
      screen
        .getByRole("link", { name: "Winter", exact: true })
        .element() as HTMLElement
    ).closest("li");
    const winter_view = page
      .elementLocator(winter_row as HTMLElement)
      .getByRole("link", { name: "/org/acme/winter", exact: true });
    expect((winter_view.element() as HTMLAnchorElement).textContent).toBe(
      "/org/acme/winter"
    );
    expect(
      (winter_view.element() as HTMLAnchorElement).getAttribute("href")
    ).toBe("/org/acme/winter");
    expect(
      (winter_view.element() as HTMLAnchorElement).getAttribute("target")
    ).toBe("_blank");
    expect(
      (winter_view.element() as HTMLAnchorElement).getAttribute("rel")
    ).toBe("noopener noreferrer");
    expect(
      screen.getByRole("link", { name: "/org/acme/spring" }).query()
    ).toBeNull();

    await expect
      .element(screen.getByText("Draft · $1 raised · No end date"))
      .toBeVisible();
    await expect
      .element(screen.getByText("Draft · $2 raised · No end date"))
      .toBeVisible();
    await expect
      .element(screen.getByText("Ended · $4 raised · No end date"))
      .toBeVisible();
    expect(screen.getByRole("link", { name: "View" }).elements().length).toBe(
      0
    );

    const supporters = screen
      .getByRole("heading", { name: "Supporter fundraisers" })
      .element().parentElement;
    const supporter = page.elementLocator(supporters as HTMLElement);
    const open = supporter.getByRole("link", { name: "Open page" });
    expect((open.element() as HTMLAnchorElement).pathname).toBe(
      "/fundraisers/f-live"
    );
    const closed = supporter.getByRole("link", { name: "Closed page" });
    expect((closed.element() as HTMLAnchorElement).pathname).toBe(
      "/fundraisers/f-ended"
    );
    expect(closed.elements().length).toBe(1);
    expect(
      supporter.getByRole("link", { name: "View", exact: true }).query()
    ).toBeNull();
    await expect
      .element(screen.getByText("Live · $9 raised · No end date"))
      .toBeVisible();

    const profile = screen.getByRole("link", { name: "/marketplace/acme" });
    expect(
      (profile.element() as HTMLAnchorElement).getAttribute("target")
    ).toBeNull();
    expect(
      (
        screen
          .getByRole("link", { name: "Edit profile" })
          .element() as HTMLAnchorElement
      ).pathname
    ).toBe("/admin/7/edit-profile");
  });
});

describe("campaign form", () => {
  it("asks before delete and end, and does not submit until the confirm", async () => {
    const { screen, posted, entered } = await render_form("live", {
      gift_count: 0,
    });
    await screen.getByRole("button", { name: "Delete" }).click();
    await expect
      .element(screen.getByRole("heading", { name: "Delete this campaign?" }))
      .toBeVisible();
    expect(entered()).toBe(false);
    await expect
      .element(
        screen.getByText("The page and its links and QR code stop working.")
      )
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Cancel" }))
      .toHaveFocus();
    expect(posted()).toBeUndefined();
    await screen.getByRole("button", { name: "Cancel" }).click();
    await expect
      .element(screen.getByRole("heading", { name: "Delete this campaign?" }))
      .not.toBeInTheDocument();
    expect(posted()).toBeUndefined();

    await screen.getByRole("button", { name: "End" }).click();
    await expect
      .element(screen.getByText("Donations stop for good."))
      .toBeVisible();
    expect(entered()).toBe(false);
    const dialog = screen.getByRole("dialog").element();
    press(page.elementLocator(dialog).getByRole("button", { name: "End" }));
    await vi.waitFor(() => {
      expect(entered()).toBe(true);
    });
    await vi_posted(posted, "end");
  });

  it("asks before the first publish and saves a live campaign without publishing", async () => {
    const draft = await render_form("draft");
    expect(
      draft.screen
        .getByRole("button", { name: "Save changes", exact: true })
        .query()
    ).toBeNull();
    expect(
      draft.screen.getByRole("button", { name: "End", exact: true }).query()
    ).toBeNull();
    const address = draft.screen.getByLabelText(/address/i);
    await address.fill("winter-drive");
    await expect
      .element(
        draft.screen.getByText(
          "Used in the public link. Letters, numbers, and - . _ ~. This address locks when you publish."
        )
      )
      .toBeVisible();
    await draft.screen.getByRole("button", { name: "Publish" }).click();
    await expect
      .element(
        draft.screen.getByText(
          "The address winter-drive locks when you publish and can't be changed later."
        )
      )
      .toBeVisible();
    expect(draft.posted()).toBeUndefined();
    const dialog = draft.screen.getByRole("dialog").element();
    press(page.elementLocator(dialog).getByRole("button", { name: "Publish" }));
    await vi_posted(draft.posted, "publish");

    const { cleanup } = await import("vitest-browser-react");
    await cleanup();
    const live = await render_form("live", { gift_count: 3, locked: true });
    expect(
      live.screen.getByRole("button", { name: "Publish", exact: true }).query()
    ).toBeNull();
    expect(
      live.screen.getByRole("button", { name: "Delete", exact: true }).query()
    ).toBeNull();
    expect(
      live.screen.getByRole("button", { name: "Save", exact: true }).query()
    ).toBeNull();
    await expect
      .element(
        live.screen.getByText(
          "The address is locked. Changing it would break links that already point here."
        )
      )
      .toBeVisible();
    expect(
      live.screen.getByText("This address locks when you publish.").query()
    ).toBeNull();
    await live.screen.getByRole("button", { name: "Save changes" }).click();
    await vi_posted(live.posted, "save");
  });

  it("does not confirm publish when the address is empty", async () => {
    const { screen, posted } = await render_form("draft");
    const address = screen.getByLabelText(/address/i);
    await address.clear();
    await screen.getByRole("button", { name: "Publish" }).click();
    expect(screen.getByRole("dialog").query()).toBeNull();
    await expect
      .element(
        screen.getByText("Enter an address. Use letters, numbers, and - . _ ~.")
      )
      .toBeVisible();
    expect(posted()).toBeUndefined();
  });

  it("leaves an ended campaign without save or publish", async () => {
    const { screen } = await render_form("ended", { gift_count: 0 });
    expect(
      screen.getByRole("button", { name: "Save", exact: true }).query()
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Save changes", exact: true }).query()
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Publish", exact: true }).query()
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "End", exact: true }).query()
    ).toBeNull();
    await expect
      .element(screen.getByRole("button", { name: "Delete" }))
      .toBeVisible();
  });

  it("shows a server refusal on the address and moves focus there", async () => {
    const { screen } = await render_form("draft");
    await screen.getByRole("button", { name: "Save" }).click();
    const refusal = "That address is already used by another campaign.";
    await expect.element(screen.getByRole("alert")).toHaveTextContent(refusal);
    const address = screen.getByLabelText(/address/i);
    await expect.element(address).toHaveAttribute("aria-invalid", "true");
    const field = (address.element() as HTMLElement).parentElement;
    await expect
      .element(
        page
          .elementLocator(field as HTMLElement)
          .getByText(refusal, { exact: true })
      )
      .toBeVisible();
    await expect.element(address).toHaveFocus();
  });

  it("links the tip note to donation settings and offers no type and no program", async () => {
    const { screen } = await render_form("draft");
    const tip = screen.getByRole("link", { name: "Settings › Donation" });
    expect((tip.element() as HTMLAnchorElement).getAttribute("href")).toBe(
      "/admin/7/settings?tab=donation"
    );
    expect(
      (
        screen
          .getByRole("checkbox", { name: /hide the better giving tip/i })
          .element() as HTMLInputElement
      ).disabled
    ).toBe(true);

    await screen.getByRole("combobox", { name: "Type" }).click();
    await expect
      .element(screen.getByRole("option", { name: "No type" }))
      .toBeVisible();
    await screen.getByRole("option", { name: "Year-end" }).click();
    await expect
      .element(screen.getByRole("combobox", { name: "Type" }))
      .toHaveTextContent("Year-end");

    await screen.getByRole("combobox", { name: "Program" }).click();
    await expect
      .element(screen.getByRole("option", { name: "No program" }))
      .toBeVisible();
    await screen.getByRole("option", { name: "Meals" }).click();
    await expect
      .element(screen.getByRole("combobox", { name: "Program" }))
      .toHaveValue("Meals");
  });
});

async function vi_posted(posted: () => unknown, op: string) {
  await vi.waitFor(() => {
    expect(posted()).toMatchObject({ op });
  });
}

describe("campaign pages", () => {
  it("crumbs the new page back to the list", async () => {
    const Stub = createRoutesStub([
      {
        path: "/admin/:id/campaigns/new",
        Component: NewPage,
        loader: () => ({
          endow: {
            id: 7,
            slug: "acme",
            donate_methods: ["stripe"],
            donate_frequencies: ["one-time"],
            hide_bg_tip: false,
          },
          programs: [],
          profile_to: "/admin/7/organization",
        }),
      },
    ]);
    const screen = await render(
      <Stub initialEntries={["/admin/7/campaigns/new"]} />
    );
    await expect
      .element(screen.getByRole("heading", { name: "New campaign" }))
      .toBeVisible();
    const crumb = screen.getByRole("link", { name: "Campaigns" });
    expect((crumb.element() as HTMLAnchorElement).pathname).toBe(
      "/admin/7/campaigns"
    );
    expect((crumb.element() as HTMLElement).className).not.toContain(
      "pointer-events-none"
    );
  });

  it("names the edit page and links a published address", async () => {
    const screen = await render(edit_stub(true));
    await expect
      .element(screen.getByRole("heading", { name: "Edit Winter" }))
      .toBeVisible();
    await expect
      .element(screen.getByText("Live", { exact: true }))
      .toBeVisible();
    const crumb = screen.getByRole("link", { name: "Campaigns" });
    expect((crumb.element() as HTMLElement).className).not.toContain(
      "pointer-events-none"
    );
    expect(
      (
        screen
          .getByRole("link", { name: "Winter", exact: true })
          .element() as HTMLElement
      ).className
    ).toContain("pointer-events-none");
    const url = screen.getByRole("link", {
      name: "https://x.test/org/acme/winter",
    });
    expect((url.element() as HTMLAnchorElement).getAttribute("target")).toBe(
      "_blank"
    );
    expect((url.element() as HTMLAnchorElement).getAttribute("rel")).toBe(
      "noopener noreferrer"
    );
  });

  it("keeps a draft address as text", async () => {
    const screen = await render(edit_stub(false));
    await expect
      .element(screen.getByText("Draft", { exact: true }))
      .toBeVisible();
    const url = "https://x.test/org/acme/winter";
    expect(screen.getByRole("link", { name: url }).query()).toBeNull();
    await expect.element(screen.getByText(url)).toBeVisible();
  });
});

function edit_stub(published: boolean) {
  const Stub = createRoutesStub([
    {
      path: "/admin/:id/campaigns/:campaign_id",
      Component: EditPage,
      loader: () => ({
        endow: {
          id: 7,
          slug: "acme",
          hide_bg_tip: false,
          donate_methods: ["stripe"],
          donate_frequencies: ["one-time"],
          logo: null,
        },
        campaign: {
          id: "c1",
          name: "Winter",
          slug: "winter",
          campaign_type: null,
          description_pt: "A story of the drive",
          banner: null,
          logo: null,
          videos: [],
          ends_at: null,
          target: undefined,
          increments: [],
          donate_methods: ["stripe"],
          donate_frequencies: ["one-time"],
          program_id: null,
          status: published ? "live" : "draft",
          published_at: published ? "2026-01-01T00:00:00.000Z" : null,
          mark: null,
        },
        programs: [],
        gift_count: 0,
        campaign_url: "https://x.test/org/acme/winter",
        shown_status: published ? "live" : "draft",
      }),
    },
  ]);
  return <Stub initialEntries={["/admin/7/campaigns/c1"]} />;
}
