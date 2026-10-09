import { createRoutesStub, Outlet, useFetcher } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";

vi.mock("$/pg/db", () => ({ db: {} }));
// the boundary is all these cases read; their server modules don't load in chromium
const route_api = vi.hoisted(() => () => ({
  action: vi.fn(),
  loader: vi.fn(),
}));
vi.mock("../dashboard.subscriptions.cancel.$sub_id/api", route_api);
vi.mock("../platform.donations.$donation_id.refund/api", route_api);
vi.mock("../platform.donations.$donation_id.void-match/api", route_api);
vi.mock("../platform.donation-settlements.create/api", route_api);
vi.mock("#/.server/toast", () => ({
  dataWithError: vi.fn(),
  redirectWithSuccess: vi.fn(),
}));

import { resp } from "@/helpers/https";
import * as edit_alloc from "../admin.$id.donations.edit-alloc/route";
import * as cancel_sub from "../dashboard.subscriptions.cancel.$sub_id/route";
import * as settlement_create from "../platform.donation-settlements.create/route";
import * as refund from "../platform.donations.$donation_id.refund/route";
import * as void_match from "../platform.donations.$donation_id.void-match/route";
import * as log_dividends from "../platform.investments.log-dividends/route";
import * as rebalance from "../platform.investments.rebalance/route";
import * as log_interest from "../platform.savings.log-interest/route";

function Submitter() {
  const fetcher = useFetcher();
  return (
    <button
      type="button"
      onClick={() => fetcher.submit({}, { method: "post" })}
    >
      Submit
    </button>
  );
}

beforeEach(async () => {
  await cleanup();
});

describe("a refused submit in a modal stays in the modal", () => {
  test.each([
    ["rebalance", rebalance],
    ["log-dividends", log_dividends],
    ["log-interest", log_interest],
    ["cancel-subscription", cancel_sub],
    ["void-match", void_match],
    ["edit-alloc", edit_alloc],
    ["refund", refund],
    ["settlement-create", settlement_create],
  ])("%s", async (path, mod) => {
    const Stub = createRoutesStub([
      {
        path: "/platform",
        Component: () => (
          <div>
            <p>platform layout</p>
            <Outlet />
          </div>
        ),
        children: [
          {
            path,
            Component: Submitter,
            ErrorBoundary: mod.ErrorBoundary,
            action: () => {
              throw resp.status(400);
            },
          },
        ],
      },
    ]);
    const screen = await render(
      <Stub initialEntries={[`/platform/${path}`]} />
    );

    await screen.getByRole("button", { name: "Submit" }).click();

    await expect
      .element(screen.getByText("The request was invalid."))
      .toBeVisible();
    await expect.element(screen.getByText("platform layout")).toBeVisible();
  });
});
