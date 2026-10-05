import { eq } from "drizzle-orm";
import {
  createRoutesStub,
  isRouteErrorResponse,
  type MiddlewareFunction,
  type SubmitTarget,
  useFetcher,
  useRouteError,
} from "react-router";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { seed_npo, seed_user } from "#/__tests__/fixtures/funds";
import { user } from "$/pg/schema/auth";
import { donations } from "$/pg/schema/donation";
import { npos } from "$/pg/schema/npo";
import { owed_amounts } from "$/pg/schema/owed";
import { loss_logs } from "$/pg/schema/revenue";
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

// the real guard and context; only the better-auth instance stays out of the bundle
vi.mock("#/.server/auth/auth", () => ({ auth: {} }));
vi.mock("#/.server/auth", async () => {
  const m = await import("#/.server/auth/middleware");
  return { user_ctx: m.user_ctx, admin_mdlwr: m.admin_mdlwr };
});

import { type AuthUser, admin_mdlwr, user_ctx } from "#/.server/auth";
import { record_owed } from "$/pg/queries/owed";
import { create_test_db } from "$/pg/test-utils/pglite";
import { loader as losses_loader } from "../../platform.losses/api";
import LossesPage from "../../platform.losses/route";
import { action, loader } from "../api";
import OwedPage from "../route";

const db = () => test_db.current!.db;
const NOW = "2026-09-14T10:00:00.000Z";

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  await db().delete(loss_logs);
  await db().delete(owed_amounts);
  await db().delete(donations);
  await db().delete(npos);
  await db().delete(user);
});

afterEach(async () => {
  await cleanup();
});

let n = 0;
async function seed_donation() {
  const id = `don_${++n}`;
  await db().insert(donations).values({
    id,
    upusd: 1,
    status: "settled",
    amount_base: 100,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via: "stripe:card",
  });
  return id;
}

/** the ticket's $100 card gift: $90 to the npo plus the $3.20 card fee */
async function seed_npo_owed(name: string) {
  const npo = await seed_npo(db(), {
    name,
    registration_number: `EIN-${++n}`,
  });
  const donation_id = await seed_donation();
  return record_owed(db() as any, {
    donation_id,
    party: { npo_id: npo!.id },
    source: "refund",
    source_ref: `re_${n}`,
    received_usd: 90,
    fee_processing_usd: 3.2,
    now: NOW,
  });
}

async function seed_referrer_owed(first: string, last: string) {
  const ref = await seed_user(db(), `ref${++n}@test.com`, first, last);
  const code = `REF-${n}`;
  await db()
    .update(user)
    .set({ referral_code: code })
    .where(eq(user.id, ref!.id));
  const donation_id = await seed_donation();
  return record_owed(db() as any, {
    donation_id,
    party: { referrer_user: code },
    source: "dispute",
    source_ref: `dp_${n}`,
    received_usd: 5,
    fee_processing_usd: 0,
    now: NOW,
  });
}

/** a verified admin, as the people who sign in to this page are */
async function seed_admin(first: string) {
  const admin = await seed_user(db(), `${first}@admin.test`, first, "Admin");
  await db()
    .update(user)
    .set({ emailVerified: true, role: "admin" })
    .where(eq(user.id, admin!.id));
  return admin!.id;
}

async function recover(owed_id: string, usd: number) {
  await db()
    .update(owed_amounts)
    .set({ recovered_usd: usd, recovered_at: NOW })
    .where(eq(owed_amounts.id, owed_id));
}

type Screen = Awaited<ReturnType<typeof render>>;

/** native clicks: the dialog's backdrop intercepts playwright's pointer */
const press = (el: Element) => (el as HTMLElement).click();

async function write_off(screen: Screen, party: string, reason: string) {
  await screen.getByRole("button", { name: `Write off ${party}` }).click();
  const dialog = screen.getByRole("dialog");
  await dialog.getByLabelText("Reason").fill(reason);
  press(
    dialog.getByRole("button", { name: "Write off", exact: true }).element()
  );
  return dialog;
}

const as_user =
  (id: string, role: string): MiddlewareFunction =>
  ({ context }, next) => {
    context.set(user_ctx, { id, role } as AuthUser);
    return next();
  };

function StatusBoundary() {
  const e = useRouteError();
  return <p>status {isRouteErrorResponse(e) ? e.status : "unknown"}</p>;
}

/** what the next press of "post" sends, one request per body, all at once */
let bodies: SubmitTarget[] = [];

/** a caller posting straight to the action, as anyone can */
function Poster() {
  const fetchers = [useFetcher({ key: "a" }), useFetcher({ key: "b" })];
  return (
    <>
      <button
        type="button"
        onClick={() => {
          for (const [i, b] of bodies.entries()) {
            fetchers[i]!.submit(b, {
              method: "POST",
              action: "/platform/owed",
              encType: "application/json",
            });
          }
        }}
      >
        post
      </button>
      {fetchers.map((f, i) => (
        <output key={i}>
          {f.state === "idle" && f.data ? JSON.stringify(f.data) : ""}
        </output>
      ))}
    </>
  );
}

async function post(viewer: IViewer, ...sent: SubmitTarget[]) {
  bodies = sent;
  const screen = await open_platform("/poster", viewer);
  await screen.getByRole("button", { name: "post" }).click();
  return screen;
}

interface IViewer {
  id: string;
  role: string;
}

function open_platform(path: string, viewer: IViewer) {
  const Stub = createRoutesStub([
    { path: "/poster", Component: Poster, ErrorBoundary: StatusBoundary },
    {
      path: "/platform",
      middleware: [as_user(viewer.id, viewer.role), admin_mdlwr],
      ErrorBoundary: StatusBoundary,
      HydrateFallback: () => null,
      children: [
        {
          path: "owed",
          Component: OwedPage as any,
          loader: loader as any,
          action: action as any,
        },
        {
          path: "losses",
          Component: LossesPage as any,
          loader: losses_loader as any,
        },
      ],
    },
  ]);
  return render(
    <Stub initialEntries={[path]} future={{ v8_middleware: true }} />
  );
}

describe("amounts owed", () => {
  it("lists what each nonprofit and referrer still owes, not what is settled", async () => {
    await seed_npo_owed("River Trust");
    await seed_referrer_owed("Ada", "Lovelace");
    const settled = await seed_npo_owed("Paid Up Trust");
    await recover(settled.id, 93.2);

    const screen = await open_platform("/platform/owed", {
      id: await seed_admin("Grace"),
      role: "admin",
    });

    await expect.element(screen.getByText("River Trust")).toBeVisible();
    await expect.element(screen.getByText("Ada Lovelace")).toBeVisible();
    expect(screen.getByText("Paid Up Trust").query()).toBeNull();
    await expect.element(screen.getByText("93.20")).toBeVisible();
  });

  it("writes off what is left after a recovery and books it as a loss by the admin", async () => {
    const admin = await seed_admin("Grace");
    const row = await seed_npo_owed("River Trust");
    await recover(row.id, 40);

    const screen = await open_platform("/platform/owed", {
      id: admin,
      role: "admin",
    });
    await write_off(screen, "River Trust", "Nonprofit closed its doors");

    await expect
      .element(screen.getByText("No amounts owed found"))
      .toBeVisible();

    await cleanup();
    const losses = await open_platform("/platform/losses", {
      id: admin,
      role: "admin",
    });
    const entry = losses.getByRole("row").filter({ hasText: "Write-off" });
    await expect.element(entry).toMatchTextContent("$53.20");
    await expect
      .element(entry)
      .toMatchTextContent("Nonprofit closed its doors");
    await expect.element(entry).toMatchTextContent("by Grace");
    expect(entry.elements()).toHaveLength(1);
  });

  it("says what a row still owes when it grew after its one write-off", async () => {
    const admin = { id: await seed_admin("Grace"), role: "admin" };
    const row = await seed_npo_owed("River Trust");
    const first = await post(admin, {
      intent: "write_off",
      owed_id: row.id,
      reason: "Closed",
    });
    await expect
      .element(first.getByRole("status").first())
      .toMatchTextContent('{"ok":true}');
    await cleanup();
    // a dispute fee lands on the gift after it was written off
    await record_owed(db() as any, {
      donation_id: row.donation_id,
      party: { npo_id: row.npo_id! },
      source: "refund",
      source_ref: row.source_ref,
      received_usd: 90,
      fee_processing_usd: 3.2,
      fee_dispute_usd: 15,
      now: NOW,
    });

    const screen = await open_platform("/platform/owed", admin);
    const dialog = await write_off(screen, "River Trust", "Closed");

    await expect
      .element(dialog)
      .toMatchTextContent("this row still owes $15.00");
  });

  it("refuses to write off a row that owes nothing", async () => {
    const admin = { id: await seed_admin("Grace"), role: "admin" };
    const row = await seed_npo_owed("River Trust");
    await recover(row.id, 93.2);

    const screen = await post(admin, {
      intent: "write_off",
      owed_id: row.id,
      reason: "Closed",
    });

    await expect
      .element(screen.getByRole("status").first())
      .toMatchTextContent("Nothing left to write off");
  });

  it("refuses a write-off whose reason is blank, and the row still owes", async () => {
    const admin = { id: await seed_admin("Grace"), role: "admin" };
    const row = await seed_npo_owed("River Trust");

    const screen = await post(admin, {
      intent: "write_off",
      owed_id: row.id,
      reason: "   ",
    });

    await expect
      .element(screen.getByRole("status").first())
      .toMatchTextContent("A reason is required");
    await cleanup();
    const list = await open_platform("/platform/owed", admin);
    await expect.element(list.getByText("93.20")).toBeVisible();
  });

  it("books one loss when the same write-off arrives twice", async () => {
    const admin = { id: await seed_admin("Grace"), role: "admin" };
    const row = await seed_npo_owed("River Trust");
    await recover(row.id, 40);
    const w = { intent: "write_off", owed_id: row.id, reason: "Closed" };

    const screen = await post(admin, w, w);

    const answers = screen.getByRole("status");
    await vi.waitFor(() =>
      expect(answers.elements().map((e) => e.textContent)).toEqual([
        '{"ok":true}',
        '{"ok":true}',
      ])
    );
    await cleanup();
    const losses = await open_platform("/platform/losses", admin);
    const entries = losses.getByRole("row").filter({ hasText: "Write-off" });
    await expect.element(entries).toMatchTextContent("$53.20");
    expect(entries.elements()).toHaveLength(1);
  });

  it("credits part of what a row owes, and the list shows what is left", async () => {
    const admin = { id: await seed_admin("Grace"), role: "admin" };
    const row = await seed_npo_owed("River Trust");
    await recover(row.id, 40);

    const screen = await open_platform("/platform/owed", admin);
    await screen.getByRole("button", { name: "Credit River Trust" }).click();
    const dialog = screen.getByRole("dialog");
    await dialog.getByLabelText("Amount (USD)").fill("20");
    await dialog.getByLabelText("Reason").fill("Payout cancelled by hand");
    await dialog.getByLabelText("Reference").fill("po_77");
    press(
      dialog.getByRole("button", { name: "Credit", exact: true }).element()
    );

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    await expect.element(screen.getByText("33.20")).toBeVisible();
    await expect.element(screen.getByText("20.00")).toBeVisible();
  });

  it("refuses a credit of nothing, or of more than the row has outstanding", async () => {
    const admin = { id: await seed_admin("Grace"), role: "admin" };
    const row = await seed_npo_owed("River Trust");
    await recover(row.id, 40);
    const credit = (usd: number) => ({
      intent: "credit",
      owed_id: row.id,
      usd,
      reason: "Payout cancelled by hand",
      ref: `po_${usd}`,
    });

    const screen = await post(admin, credit(0), credit(60));

    const [none, over] = screen.getByRole("status").all();
    await expect.element(none!).toMatchTextContent("more than $0");
    await expect
      .element(over!)
      .toMatchTextContent("more than this row has outstanding");
    await cleanup();
    const list = await open_platform("/platform/owed", admin);
    await expect.element(list.getByText("53.20")).toBeVisible();
  });

  it("refuses a credit on a row already written off in full, rather than failing", async () => {
    const admin = { id: await seed_admin("Grace"), role: "admin" };
    const row = await seed_npo_owed("River Trust");
    const w = await post(admin, {
      intent: "write_off",
      owed_id: row.id,
      reason: "Closed",
    });
    await expect
      .element(w.getByRole("status").first())
      .toMatchTextContent('{"ok":true}');
    await cleanup();

    const screen = await post(admin, {
      intent: "credit",
      owed_id: row.id,
      usd: 1,
      reason: "Payout cancelled by hand",
      ref: "po_1",
    });

    await expect
      .element(screen.getByRole("status").first())
      .toMatchTextContent("more than this row has outstanding");
  });

  it("answers 403 to anyone but a platform admin, page and action alike", async () => {
    const someone = await seed_user(db(), "npo@test.com");
    const npo_admin = { id: someone!.id, role: "user" };
    const row = await seed_npo_owed("River Trust");

    const page = await open_platform("/platform/owed", npo_admin);
    await expect.element(page.getByText("status 403")).toBeVisible();
    expect(page.getByText("River Trust").query()).toBeNull();
    await cleanup();

    const poster = await post(npo_admin, {
      intent: "write_off",
      owed_id: row.id,
      reason: "Closed",
    });
    await expect.element(poster.getByText("status 403")).toBeVisible();
    await cleanup();

    const list = await open_platform("/platform/owed", {
      id: await seed_admin("Grace"),
      role: "admin",
    });
    await expect.element(list.getByText("93.20")).toBeVisible();
  });
});
