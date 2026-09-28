import { eq } from "drizzle-orm";
import { createRoutesStub } from "react-router";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { seed_npo } from "#/__tests__/fixtures/funds";
import { npos } from "$/pg/schema/npo";
import type { TestDb } from "$/pg/test-utils/pglite";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));

vi.mock("$/pg/db", () => ({
  db: new Proxy(
    {},
    {
      get(_, prop) {
        const real = test_db.current?.db;
        if (!real) throw new Error("test_db not initialized");
        return (real as any)[prop];
      },
    }
  ),
}));
vi.mock("#/.server/auth", async () =>
  (await import("$/auth/test-utils")).make_auth_mock()
);
vi.mock("#/.server/toast", async () => {
  const { redirect } = await import("react-router");
  return { redirectWithSuccess: vi.fn((url: string) => redirect(url)) };
});

import * as route from "#/routes/admin.$id.savings.withdraw/route";
import { admin_ctx } from "$/auth/test-utils";
import { create_test_db } from "$/pg/test-utils/pglite";

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

/** the route module as framework mode wires it: `clientLoader` in front of `loader` */
function render_route(npo_id: number) {
  const Stub = createRoutesStub([
    {
      path: "/admin/:id/savings/withdraw",
      middleware: [
        async ({ context }, next) => {
          context.set(admin_ctx, npo_id);
          return next();
        },
      ],
      Component: route.default,
      HydrateFallback: () => null,
      loader: ((args: any) =>
        route.clientLoader({
          ...args,
          serverLoader: () => route.loader(args),
        })) as any,
      action: route.action as any,
      shouldRevalidate: route.shouldRevalidate,
    },
  ]);
  return render(
    <Stub
      initialEntries={[`/admin/${npo_id}/savings/withdraw`]}
      future={{ v8_middleware: true }}
    />
  );
}

describe("savings withdraw route", () => {
  test("a withdrawal the balance no longer covers is refused on the amount field, beside the balance the server holds", async () => {
    const npo = await seed_npo(test_db.current!.db, {
      registration_number: "EIN-REFUSAL",
      liq: 100,
    });
    const screen = await render_route(npo!.id);
    await expect.element(screen.getByText("$100")).toBeVisible();

    // a co-admin draws the balance down after this form loaded
    await test_db
      .current!.db.update(npos)
      .set({ liq: 40 })
      .where(eq(npos.id, npo!.id));

    // the page at the commit the refusal first renders: remix-client-cache's swr
    // would show it beside the cached $100 until its background load lands
    const balance_when_refused: string[] = [];
    const observer = new MutationObserver(() => {
      const refusal = screen.getByText("amount exceeds balance").query();
      if (refusal && !balance_when_refused.length) {
        balance_when_refused.push(document.body.textContent ?? "");
      }
    });
    observer.observe(document.body, { subtree: true, childList: true });

    const amount = screen.getByLabelText(/amount/i);
    await amount.fill("60");
    (
      screen.getByRole("button", { name: /submit/i }).element() as HTMLElement
    ).click();

    await expect
      .element(screen.getByText("amount exceeds balance"))
      .toBeVisible();
    await expect.element(amount).toHaveFocus();
    await expect.element(screen.getByText("$40")).toBeVisible();
    observer.disconnect();
    expect(balance_when_refused[0]).toContain("$40");
  });
});
