import { createRoutesStub, Outlet, useFetcher } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";

vi.mock("$/pg/db", () => ({ db: {} }));
vi.mock("#/.server/toast", () => ({
  dataWithError: vi.fn(),
  redirectWithSuccess: vi.fn(),
}));

import { resp } from "@/helpers/https";
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

describe("a refused submit in a /platform modal stays in the modal", () => {
  test.each([
    ["rebalance", rebalance],
    ["log-dividends", log_dividends],
    ["log-interest", log_interest],
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
