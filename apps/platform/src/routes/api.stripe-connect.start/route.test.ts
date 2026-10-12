import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import type { TestDb } from "$/pg/test-utils/pglite";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
const cfg = vi.hoisted(() => ({
  client_id: "ca_TestOnly000000" as string | undefined,
}));
const session = vi.hoisted(() => ({
  user: undefined as
    | { id: string; email: string; role?: string | null }
    | undefined,
}));

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
vi.mock("$/env", async (orig) => {
  const real = await orig<typeof import("$/env")>();
  return {
    ...real,
    get stripe() {
      return { ...real.stripe, connect_client_id: cfg.client_id };
    },
  };
});
vi.mock("#/.server/auth", async () => ({
  get_session: vi.fn(async () => ({ user: session.user })),
  to_auth: (await import("#/.server/auth/to-auth")).to_auth,
}));

const { loader } = await import("./route");
const { read_state } = await import("$/stripe-connect/state");
const { seed_npo, seed_user } = await import("#/__tests__/fixtures/funds");
const { user_npo_memberships } = await import("$/pg/schema/user");
const { registrations } = await import("$/pg/schema/registration");

const db = () => test_db.current!.db;

/** a signed-in npo member, and the npo they belong to */
const member_of_npo = async (tag: string) => {
  const u = await seed_user(db(), `${tag}@npo.test`);
  const npo = await seed_npo(db(), { registration_number: `EIN-${tag}` });
  await db()
    .insert(user_npo_memberships)
    .values({ user_id: u!.id, npo_id: npo!.id });
  session.user = { id: u!.id, email: u!.email, role: "user" };
  return { user: u!, npo: npo! };
};

const seed_reg = async (
  r_id: string,
  o: { o_stripe_account_id?: string } = {}
) => {
  const id = crypto.randomUUID();
  await db()
    .insert(registrations)
    .values({ id, r_id, status: "01", ...o });
  return id;
};

const call = async (qs: string) =>
  (await (loader as any)({
    request: new Request(`https://app.test/api/stripe-connect/start?${qs}`),
    params: {},
    context: {},
  })) as Response;

beforeAll(async () => {
  const { create_test_db } = await import("$/pg/test-utils/pglite");
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(() => {
  session.user = undefined;
  cfg.client_id = "ca_TestOnly000000";
});

const state_of = (res: Response) => {
  const to = new URL(res.headers.get("location")!);
  const st = read_state(to.searchParams.get("state"));
  if (st.status === "invalid") throw new Error("state does not verify");
  return st.state;
};

describe("stripe connect start", () => {
  test("no session goes to sign in, coming back here", async () => {
    const res = await call("kind=npo&npo_id=1");

    expect(res.status).toBe(302);
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/signup");
    expect(to.searchParams.get("redirect")).toBe(
      "/api/stripe-connect/start?kind=npo&npo_id=1"
    );
  });

  test("an npo member is sent to stripe's authorize page with a state that verifies", async () => {
    const { user, npo } = await member_of_npo("start-ok");

    const res = await call(`kind=npo&npo_id=${npo.id}`);

    expect(res.status).toBe(302);
    const to = new URL(res.headers.get("location")!);
    expect(`${to.origin}${to.pathname}`).toBe(
      "https://connect.stripe.com/oauth/authorize"
    );
    expect(to.searchParams.get("response_type")).toBe("code");
    expect(to.searchParams.get("client_id")).toBe("ca_TestOnly000000");
    expect(to.searchParams.get("scope")).toBe("read_write");
    expect(to.searchParams.get("redirect_uri")).toBe(
      "https://app.test/api/stripe-connect/callback"
    );
    const st = read_state(to.searchParams.get("state"));
    expect(st.status).toBe("valid");
    expect(st.status !== "invalid" && st.state).toMatchObject({
      t: { kind: "npo", npo_id: npo.id },
      uid: user.id,
      replace: false,
    });
  });

  test("a signed-in user outside the npo is refused", async () => {
    const { npo } = await member_of_npo("start-other-npo");
    const outsider = await seed_user(db(), "outsider@npo.test");
    session.user = { id: outsider!.id, email: outsider!.email, role: "user" };

    const res = await call(`kind=npo&npo_id=${npo.id}`);

    expect(res.status).toBe(403);
  });

  test("an admin may start for any npo", async () => {
    const npo = await seed_npo(db(), {
      registration_number: "EIN-start-admin",
    });
    session.user = { id: "admin-1", email: "admin@bg.test", role: "admin" };

    const res = await call(`kind=npo&npo_id=${npo!.id}`);

    expect(state_of(res).t).toEqual({ kind: "npo", npo_id: npo!.id });
  });

  test("the applicant starts for their own registration", async () => {
    const reg_id = await seed_reg("applicant@reg.test");
    session.user = { id: "u-app", email: "applicant@reg.test", role: "user" };

    const res = await call(`kind=reg&reg_id=${reg_id}`);

    expect(state_of(res)).toMatchObject({
      t: { kind: "reg", reg_id },
      uid: "u-app",
    });
  });

  test("someone else's registration is refused", async () => {
    const reg_id = await seed_reg("applicant2@reg.test");
    session.user = { id: "u-x", email: "intruder@reg.test", role: "user" };

    const res = await call(`kind=reg&reg_id=${reg_id}`);

    expect(res.status).toBe(403);
  });

  test("answers 503 when connect is not configured", async () => {
    const { npo } = await member_of_npo("start-503");
    cfg.client_id = undefined;

    const res = await call(`kind=npo&npo_id=${npo.id}`);

    expect(res.status).toBe(503);
  });

  test("a target already holding an account goes back unless replace is confirmed", async () => {
    const reg_id = await seed_reg("holder@reg.test", {
      o_stripe_account_id: "acct_held",
    });
    session.user = { id: "u-h", email: "holder@reg.test", role: "user" };

    const refused = await call(`kind=reg&reg_id=${reg_id}`);
    const back = new URL(refused.headers.get("location")!, "https://app.test");
    expect(back.pathname).toBe(`/register/${reg_id}/4`);
    expect(back.searchParams.get("stripe_connect")).toBe("error");
    expect(back.searchParams.get("stripe_connect_reason")).toBe(
      "replace_unconfirmed"
    );

    const confirmed = await call(`kind=reg&reg_id=${reg_id}&replace=1`);
    expect(state_of(confirmed).replace).toBe(true);
  });
});
