import { createRoutesStub } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
// the logo's size is stylesheet output
import "#/index.css";

vi.mock("$/pg/db", () => ({ db: {} }));
vi.mock("#/.server/auth", () => ({
  admin_ctx: Symbol("admin"),
  user_ctx: Symbol("user"),
}));

import { CampaignForm, type ICampaignFormInit } from "./form";

const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const init = (logo: string): ICampaignFormInit => ({
  name: "Winter",
  slug: "winter",
  campaign_type: "",
  description_pt: "",
  banner: "",
  logo,
  videos: [],
  ends_at: null,
  target: undefined,
  increments: [],
  donate_methods: ["stripe"],
  donate_frequencies: ["one-time"],
  hide_bg_tip: true,
  program_id: null,
});

async function logo_box(logo: string) {
  const Stub = createRoutesStub([
    {
      path: "/admin/:id/campaigns/new",
      Component: () => (
        <CampaignForm
          init={init(logo)}
          programs={[]}
          locked={false}
          status={null}
          gift_count={0}
          fallback_methods={["stripe"]}
          fallback_frequencies={["one-time"]}
          settings_donation_to="/admin/7/settings?tab=donation"
          link_base="https://x.test/org/acme/"
        />
      ),
    },
  ]);
  const screen = await render(
    <Stub initialEntries={["/admin/7/campaigns/new"]} />
  );
  await expect.element(screen.getByText("Logo", { exact: true })).toBeVisible();
  const input = document.getElementById("campaign-logo") as HTMLElement;
  const dropzone = input.closest("[data-drag]") as HTMLElement;
  const form = dropzone.closest("form") as HTMLElement;
  const inset = Number.parseFloat(getComputedStyle(form).paddingRight);
  return {
    box: dropzone.getBoundingClientRect(),
    content_right: form.getBoundingClientRect().right - inset,
  };
}

describe("campaign form: logo", () => {
  test.each([
    ["empty", ""],
    ["with a preview", PIXEL],
  ])("is a 240px square on desktop, %s", async (_, logo) => {
    await page.viewport(1440, 900);
    const { box } = await logo_box(logo);
    expect(box.width).toBe(240);
    expect(box.height).toBe(240);
  });

  test("stays inside the card at 375px", async () => {
    await page.viewport(375, 812);
    const { box, content_right } = await logo_box(PIXEL);
    expect(box.width).toBe(240);
    expect(box.right).toBeLessThanOrEqual(content_right);
  });
});
