import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";

vi.mock("$/pg/db", () => ({ db: {} }));

import { blank_init, CampaignForm, type ICampaignFormInit } from "./form";

afterEach(async () => {
  await cleanup();
});

const BASE = "https://x.test/org/acme/";

const saved: ICampaignFormInit = {
  ...blank_init(["stripe"], ["one-time"], false),
  name: "Winter",
  slug: "winter",
  description_pt: "A story of the drive",
};

async function render_form(
  init: ICampaignFormInit,
  status: "draft" | "live" | null,
  locked = false,
  base = BASE
) {
  const Stub = createRoutesStub([
    {
      path: "/admin/:id/campaigns/form",
      Component: () => (
        <CampaignForm
          init={init}
          programs={[]}
          locked={locked}
          status={status}
          gift_count={0}
          fallback_methods={["stripe"]}
          fallback_frequencies={["one-time"]}
          settings_donation_to="/admin/7/settings?tab=donation"
          link_base={base}
        />
      ),
    },
  ]);
  return render(<Stub initialEntries={["/admin/7/campaigns/form"]} />);
}

describe("campaign link field", () => {
  it("shows the fixed part of the link beside the input and previews the full link", async () => {
    const screen = await render_form(saved, "draft");
    const input = screen.getByLabelText("Campaign link", { exact: true });
    await expect.element(input).toHaveValue("winter");
    await expect
      .element(input)
      .toHaveAccessibleDescription(
        /Letters, numbers, and - \. _ ~\. The link can't change after you publish\./
      );
    await expect
      .element(screen.getByText("x.test/org/acme/", { exact: true }))
      .toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Donors will find this campaign at https://x.test/org/acme/winter"
        )
      )
      .toBeVisible();

    await input.fill("coat-drive");
    await expect
      .element(
        screen.getByText(
          "Donors will find this campaign at https://x.test/org/acme/coat-drive"
        )
      )
      .toBeVisible();
    expect(screen.getByRole("link", { name: /x\.test\/org/ }).query()).toBe(
      null
    );
  });

  it("links the preview of a published campaign in a new tab", async () => {
    const screen = await render_form(saved, "live", true);
    const link = screen.getByRole("link", {
      name: "https://x.test/org/acme/winter",
    });
    await expect.element(link).toHaveAttribute("target", "_blank");
    await expect
      .element(
        screen.getByText(
          "This link is fixed because the campaign is published."
        )
      )
      .toBeVisible();
  });

  it("suggests the link from the name on a new campaign until the link is edited", async () => {
    const screen = await render_form(
      blank_init(["stripe"], ["one-time"], false),
      null
    );
    const name = screen.getByLabelText("Name", { exact: true });
    const link = screen.getByLabelText("Campaign link", { exact: true });

    await name.fill("Winter Coat Drive");
    await expect.element(link).toHaveValue("winter-coat-drive");
    await expect
      .element(
        screen.getByText(
          "Donors will find this campaign at https://x.test/org/acme/winter-coat-drive"
        )
      )
      .toBeVisible();

    await link.fill("coats");
    await name.fill("Spring Gala");
    await expect.element(link).toHaveValue("coats");
  });

  it("never fills the link from the name on an existing campaign", async () => {
    const screen = await render_form(saved, "draft");
    await screen.getByLabelText("Name", { exact: true }).fill("Spring Gala");
    await expect
      .element(screen.getByLabelText("Campaign link", { exact: true }))
      .toHaveValue("winter");
  });

  it("keeps the input on screen at 375px behind a long fixed part", async () => {
    await page.viewport(375, 667);
    try {
      const screen = await render_form(
        saved,
        "draft",
        false,
        "https://preview-branch.better-giving.example/org/a-rather-long-nonprofit-slug/"
      );
      const input = screen.getByLabelText("Campaign link", { exact: true });
      await expect.element(input).toBeVisible();
      await vi.waitFor(() => {
        const box = (input.element() as HTMLElement).getBoundingClientRect();
        expect(box.width).toBeGreaterThanOrEqual(128);
        expect(box.right).toBeLessThanOrEqual(375);
        const doc = document.documentElement;
        expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth);
      });
      // one line, clipped: the fixed part gives up its start, not the row height
      const fixed = screen
        .getByText(
          "preview-branch.better-giving.example/org/a-rather-long-nonprofit-slug/",
          { exact: true }
        )
        .element().parentElement as HTMLElement;
      const line = Number.parseFloat(getComputedStyle(fixed).lineHeight);
      expect(fixed.getBoundingClientRect().height).toBeLessThan(line * 1.5);
      expect(fixed.scrollWidth).toBeGreaterThan(fixed.clientWidth);
    } finally {
      await page.viewport(1280, 900);
    }
  });

  it("wraps the preview at 375px only between words, after a slash or a hyphen", async () => {
    await page.viewport(375, 667);
    try {
      const screen = await render_form(
        saved,
        "draft",
        false,
        "https://preview-branch.better-giving.example/org/a-rather-long-nonprofit-slug/"
      );
      const preview = screen
        .getByText("Donors will find this campaign at")
        .element() as HTMLElement;
      await vi.waitFor(() => {
        // the character before each line start, across the text nodes the
        // preview is split into
        const chars: { ch: string; top: number }[] = [];
        const walk = document.createTreeWalker(preview, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          const text = n.textContent ?? "";
          for (let i = 0; i < text.length; i++) {
            range.setStart(n, i);
            range.setEnd(n, i + 1);
            const rect = range.getClientRects()[0];
            if (rect) chars.push({ ch: text[i], top: Math.round(rect.top) });
          }
        }
        let wraps = 0;
        for (let i = 1; i < chars.length; i++) {
          if (chars[i].top > chars[i - 1].top) {
            wraps += 1;
            expect(chars[i - 1].ch).toMatch(/[\s/-]/);
          }
        }
        expect(wraps).toBeGreaterThan(0);
        expect(preview.scrollWidth).toBeLessThanOrEqual(preview.clientWidth);
      });
    } finally {
      await page.viewport(1280, 900);
    }
  });
});
