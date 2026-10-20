import type { MetaDescriptor } from "react-router";
import { describe, expect, test, vi } from "vitest";

vi.mock("$/pg/db", () => ({ db: {} }));
vi.mock("#/.server/auth", async () =>
  (await import("$/auth/test-utils")).make_auth_mock({
    user_ctx: true,
    middleware: true,
  })
);
vi.mock("#/.server/toast", () => ({
  dataWithSuccess: (d: unknown) => d,
  dataWithError: (d: unknown) => d,
  redirectWithSuccess: (url: string) => url,
}));
vi.mock("$/kit/queue", () => ({ enqueue: vi.fn() }));

import { meta as campaigns_meta } from "../admin.$id.campaigns/route";
import { meta as edit_meta } from "../admin.$id.campaigns_.$campaign_id/route";
import * as dashboard_route from "../admin.$id.dashboard/route";
import { meta as profile_meta } from "../admin.$id.edit-profile/route";
import { meta as organization_meta } from "../admin.$id.organization/route";
import { meta as settings_meta } from "../admin.$id.settings/route";
import { meta as layout_meta } from "./route";

const ORG = "North Shore";

const layout_data = {
  user: { id: "u-1" },
  id: 7,
  endow: {
    logo: null,
    name: ORG,
    allocation: { grant: 100, savings: 0, lock: 0 },
    payout_minimum: 50,
  },
};

// React Router copies the layout title only when the leaf exports no `meta`.
// Parent `meta` is the layout's real descriptors: a leaf that also returns
// them would put both titles on the document. A fresh array per call, because
// a leaf that empties this match would hide that from the next leaf.
function layout_matches() {
  return [
    {
      id: "routes/admin.$id",
      pathname: "/admin/7",
      params: { id: "7" },
      data: layout_data,
      loaderData: layout_data,
      meta: layout_meta({ loaderData: layout_data } as never),
    },
  ];
}

function title(descriptors: MetaDescriptor[] | undefined) {
  const titled = descriptors?.find(
    (d): d is { title: string } => "title" in d && typeof d.title === "string"
  );
  return titled?.title;
}

function titles(descriptors: MetaDescriptor[] | undefined) {
  return (descriptors ?? []).flatMap((d) =>
    "title" in d && typeof d.title === "string" ? [d.title] : []
  );
}

describe("admin document titles", () => {
  test("dashboard keeps the layout title, with no trailing space", () => {
    expect(title(layout_meta({ loaderData: layout_data } as never))).toBe(
      "Dashboard - North Shore"
    );
    expect("meta" in dashboard_route).toBe(false);
  });

  test("campaigns, edit, settings, organization, and public profile replace the layout title", () => {
    const pages = [
      [
        "Campaigns - North Shore",
        campaigns_meta({ matches: layout_matches() } as never),
      ],
      [
        "Edit Winter - North Shore",
        edit_meta({
          matches: layout_matches(),
          loaderData: { campaign: { name: "Winter" } },
        } as never),
      ],
      [
        "Settings - North Shore",
        settings_meta({ matches: layout_matches() } as never),
      ],
      [
        "Organization - North Shore",
        organization_meta({ matches: layout_matches() } as never),
      ],
      [
        "Public profile - North Shore",
        profile_meta({ matches: layout_matches() } as never),
      ],
    ] as const;

    for (const [expected, descriptors] of pages) {
      expect(titles(descriptors)).toEqual([expected]);
    }
  });
});
