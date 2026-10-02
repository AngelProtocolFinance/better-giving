import { createRoutesStub, Link, Outlet } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { ISettlementPreview } from "./types";

// the real action and loader are exercised in api.test.ts; here they stand in
// so the page's own wiring is what's under test, without the server graph
vi.mock("./api", () => ({ action: vi.fn(), loader: vi.fn() }));

import Page, { ErrorBoundary } from "./route";

const preview = {
  npo_name: "Test NPO",
  fiscal_sponsored: false,
  nav_price: 1,
  txs: [],
} as ISettlementPreview;

function setup() {
  const keys: string[] = [];
  let fail_next = true;
  const Stub = createRoutesStub([
    {
      path: "/settlements",
      Component: () => (
        <>
          <Link to="create">New settlement</Link>
          <Outlet />
        </>
      ),
      children: [
        {
          path: "create",
          Component: Page as any,
          ErrorBoundary,
          loader: ({ request }) => {
            const net = Number(new URL(request.url).searchParams.get("net"));
            return net > 0
              ? { preview, previews: [preview], error: null }
              : { preview: null, previews: [], error: null };
          },
          action: async ({ request }) => {
            const fd = await request.formData();
            keys.push(String(fd.get("idempotency_key")));
            if (fail_next) {
              fail_next = false;
              throw new Response("boom", { status: 500 });
            }
            return { ok: true as const };
          },
        },
      ],
    },
  ]);
  return { Stub, keys };
}

type Screen = Awaited<ReturnType<typeof render>>;

// inside the dialog the backdrop intercepts playwright's pointer, so presses
// go through the dom
const press = (screen: Screen, name: string) =>
  (
    screen.getByRole("button", { name, exact: true }).element() as HTMLElement
  ).click();

async function preview_and_confirm(screen: Screen, net: string) {
  await expect
    .element(screen.getByRole("heading", { name: "New settlement" }))
    .toBeVisible();
  await screen.getByLabelText("From").selectOptions("match");
  await screen.getByLabelText("For donation ID").fill("gift-1");
  await screen.getByLabelText("Net amount (USD)").fill(net);
  await screen.getByLabelText("Reference / Grant ID").fill("ACME #42");
  press(screen, "Preview");
  await expect
    .element(screen.getByRole("heading", { name: "Confirm settlement" }))
    .toBeVisible();
  press(screen, "Confirm");
}

async function fail_and_reopen(screen: Screen) {
  await expect
    .element(screen.getByText("Something went wrong", { exact: true }).first())
    .toBeVisible();
  press(screen, "Ok");
  await expect
    .element(screen.getByText("Something went wrong", { exact: true }))
    .not.toBeInTheDocument();
  (
    screen
      .getByRole("link", { name: "New settlement" })
      .element() as HTMLElement
  ).click();
}

beforeEach(() => sessionStorage.clear());

describe("settlement create — a confirm that never answered", () => {
  test("previewing the same settlement again confirms under the same key", async () => {
    const { Stub, keys } = setup();
    const screen = await render(
      <Stub initialEntries={["/settlements/create"]} />
    );

    await preview_and_confirm(screen, "100");
    await fail_and_reopen(screen);
    await preview_and_confirm(screen, "100");

    await expect
      .element(screen.getByRole("heading", { name: "Settlement created" }))
      .toBeVisible();
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  test("a changed value is a different settlement, under a new key", async () => {
    const { Stub, keys } = setup();
    const screen = await render(
      <Stub initialEntries={["/settlements/create"]} />
    );

    await preview_and_confirm(screen, "100");
    await fail_and_reopen(screen);
    await preview_and_confirm(screen, "250");

    await expect
      .element(screen.getByRole("heading", { name: "Settlement created" }))
      .toBeVisible();
    expect(keys).toHaveLength(2);
    expect(keys[1]).not.toBe(keys[0]);
  });
});
