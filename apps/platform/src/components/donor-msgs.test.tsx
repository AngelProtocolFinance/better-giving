import { HttpResponse, http } from "msw";
import { SWRConfig } from "swr";
import { describe, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { mswWorker } from "#/setup-tests-browser";
import { DonorMsgs, type IDonorHighlight } from "./donor-msgs";

const HOUR = 3_600_000;

function hours_ago(hours: number) {
  return new Date(Date.now() - hours * HOUR - 60_000).toISOString();
}

function same_local_day(iso: string) {
  const then = new Date(iso);
  const now = new Date();
  return (
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate()
  );
}

function days_ago(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(15, 0, 0, 0);
  return d.toISOString();
}

function row(
  name: string,
  extra: { amount?: number; message?: string | null; date?: string } = {}
) {
  return {
    id: name,
    donor_name: name,
    donor_message: extra.message ?? null,
    amount: extra.amount,
    date: extra.date,
  };
}

function donors(
  id: string,
  pages: Record<
    string,
    { items: ReturnType<typeof row>[]; next: string | null }
  >
) {
  mswWorker.use(
    http.get(`/api/npo/${id}/donors`, ({ request }) => {
      const key = new URL(request.url).searchParams.get("next") ?? "";
      const body = pages[key] ?? { items: [], next: null };
      return HttpResponse.json(body);
    })
  );
}

function mount(
  id: string,
  props: {
    layout?: "wall" | "feed";
    highlight?: IDonorHighlight;
    campaign_id?: string;
  } = {}
) {
  return render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <DonorMsgs id={id} {...props} />
    </SWRConfig>
  );
}

describe("donor messages", () => {
  test("the wall keeps the card, the heading, and View more", async () => {
    donors("wall-1", {
      "": {
        items: [
          row("Ada Lovelace", {
            amount: 40,
            message: "For the Tuesday stew.",
            date: hours_ago(2),
          }),
        ],
        next: "page-2",
      },
      "page-2": { items: [row("Grace Hopper", { amount: 15 })], next: null },
    });
    const screen = await mount("wall-1");
    await expect
      .element(screen.getByRole("heading", { name: "Donors" }))
      .toBeVisible();
    await expect.element(screen.getByText("Ada Lovelace")).toBeVisible();
    await expect
      .element(screen.getByText("For the Tuesday stew."))
      .toBeVisible();
    expect(screen.getByText("$40").query()).toBeNull();
    expect(screen.getByText("2 hours ago").query()).toBeNull();
    expect(document.querySelector("article")).toBeNull();
    expect(document.querySelector(".card")).not.toBeNull();
    await screen.getByRole("button", { name: "View more" }).click();
    await expect.element(screen.getByText("Grace Hopper")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "See all donors" }).query()
    ).toBeNull();
  });

  test("a feed card shows the amount, the message, and a relative time", async () => {
    const ada_date = hours_ago(2);
    // calendar day wins: two hours ago reads Yesterday once local midnight has passed
    const ada_time = same_local_day(ada_date) ? "2 hours ago" : "Yesterday";
    donors("feed-1", {
      "": {
        items: [
          row("Ada Lovelace", {
            amount: 40,
            message: "For the Tuesday stew.",
            date: ada_date,
          }),
          row("Grace Hopper", { amount: 15, date: days_ago(1) }),
          row("Katherine Johnson", {
            amount: 1250,
            message: "Still cooking.",
            date: days_ago(3),
          }),
          row("Quiet Donor", { amount: 8 }),
        ],
        next: null,
      },
    });
    const screen = await mount("feed-1", { layout: "feed" });
    await expect.element(screen.getByText("Ada Lovelace")).toBeVisible();
    const gift = screen.getByText("$40");
    await expect.element(gift).toBeVisible();
    expect(gift.element().className).toContain("font-bold");
    expect(gift.element().className).toContain("text-success-subtle-fg");
    await expect
      .element(screen.getByText("For the Tuesday stew."))
      .toBeVisible();
    const ada = screen.getByText("Ada Lovelace").element().closest("article");
    if (!ada) throw new Error("ada card missing");
    await expect
      .element(page.elementLocator(ada).getByText(ada_time))
      .toBeVisible();
    const grace = screen.getByText("Grace Hopper").element().closest("article");
    if (!grace) throw new Error("grace card missing");
    await expect
      .element(page.elementLocator(grace).getByText("Yesterday"))
      .toBeVisible();
    await expect.element(screen.getByText("3 days ago")).toBeVisible();
    await expect.element(screen.getByText("$1,250")).toBeVisible();
    const quiet = screen.getByText("Quiet Donor").element().closest("article");
    expect(quiet?.textContent).toBe("Quiet Donor$8");
    const card = screen.getByText("Ada Lovelace").element().closest("article");
    expect(card?.classList.contains("bg-gray-2")).toBe(true);
    expect(card?.classList.contains("border-gray-6")).toBe(true);
    expect(card?.classList.contains("rounded")).toBe(true);
    expect(card?.classList.contains("p-3")).toBe(true);
    expect(card?.classList.contains("bg-panel")).toBe(false);
    expect(card?.classList.contains("card")).toBe(false);
    expect(screen.getByRole("heading", { name: "Donors" }).query()).toBeNull();
  });

  test("the highlight card puts the amount on the name row", async () => {
    donors("feed-you", { "": { items: [], next: null } });
    const screen = await mount("feed-you", {
      layout: "feed",
      highlight: { name: "You", amount: "$25" },
    });
    await expect.element(screen.getByText("You")).toBeVisible();
    const gift = screen.getByText("$25");
    await expect.element(gift).toBeVisible();
    expect(gift.element().className).toContain("font-bold");
    expect(gift.element().className).toContain("text-success-subtle-fg");
    await expect.element(screen.getByText("Just now")).toBeVisible();
    const card = screen.getByText("You").element().closest("article");
    expect(card?.classList.contains("bg-green-3")).toBe(true);
    expect(card?.classList.contains("border-green-6")).toBe(true);
    expect(card?.textContent).toBe("You$25Just now");
  });

  test("under 1440px six cards show, and See all reveals the rest", async () => {
    await page.viewport(390, 800);
    const names = ["Mira", "Noor", "Owen", "Pia", "Quinn", "Rhea", "Soren"];
    donors("feed-cap", {
      "": {
        items: names.map((name) =>
          row(name, { amount: 10, date: hours_ago(5) })
        ),
        next: null,
      },
    });
    const screen = await mount("feed-cap", {
      layout: "feed",
      highlight: { name: "You", amount: "$25" },
    });
    await expect.element(screen.getByText("You")).toBeVisible();
    await expect.element(screen.getByText("Quinn")).toBeVisible();
    const hidden = screen.getByText("Rhea").element().closest("article");
    expect(hidden?.className).toContain("hidden");
    expect(hidden?.className).toContain("min-[1440px]:flex");
    await expect.element(screen.getByText("Rhea")).not.toBeVisible();
    await expect.element(screen.getByText("Soren")).not.toBeVisible();
    const see_all = screen.getByRole("button", { name: "See all donors" });
    await expect.element(see_all).toBeVisible();
    await page.viewport(1440, 900);
    await expect.element(screen.getByText("Soren")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "See all donors" }).query()
    ).toBeNull();
    await page.viewport(390, 800);
    await screen.getByRole("button", { name: "See all donors" }).click();
    await expect.element(screen.getByText("Soren")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "See all donors" }).query()
    ).toBeNull();
  });

  test("at 1440px every loaded card shows, and See all pages while next is set", async () => {
    await page.viewport(1440, 900);
    const names = ["Mira", "Noor", "Owen", "Pia", "Quinn", "Rhea", "Soren"];
    donors("feed-wide", {
      "": {
        items: names.map((name) => row(name, { amount: 10 })),
        next: "page-2",
      },
      "page-2": { items: [row("Tove", { amount: 12 })], next: null },
    });
    const screen = await mount("feed-wide", { layout: "feed" });
    await expect.element(screen.getByText("Soren")).toBeVisible();
    const see_all = screen.getByRole("button", { name: "See all donors" });
    await expect.element(see_all).toBeVisible();
    await see_all.click();
    await expect.element(screen.getByText("Tove")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "See all donors" }).query()
    ).toBeNull();
  });
});
