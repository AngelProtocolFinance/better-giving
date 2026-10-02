import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- mocks (hoisted) ---

const q = vi.hoisted(() => ({ npo_get: vi.fn(), npo_admin_tx: vi.fn() }));

vi.mock("$/pg/queries/npo", () => ({ npo_get: q.npo_get }));
vi.mock("$/pg/queries/user", () => ({ npo_admin_tx: q.npo_admin_tx }));
vi.mock("$/pg/db", () => ({ db: {} }));
vi.mock("$/kit/queue", () => ({ enqueue: vi.fn() }));
vi.mock("#/.server/auth", async () =>
  (await import("$/auth/test-utils")).make_auth_mock({ user_ctx: true })
);
vi.mock("#/.server/toast", async () => {
  const { redirect } = await import("react-router");
  return { redirectWithSuccess: vi.fn((url: string) => redirect(url)) };
});

// --- imports (after mocks hoisted) ---

import { admin_ctx, user_ctx } from "#/.server/auth";
import { enqueue } from "$/kit/queue";
import { add_action } from "./api";

const NPO_ID = 11;

const call = () => {
  const fd = new FormData();
  fd.set("first_name", "Ada");
  fd.set("last_name", "Lovelace");
  fd.set("email", "ada@test.com");
  return (add_action as any)({
    request: new Request(`http://x/admin/${NPO_ID}/members/add`, {
      method: "POST",
      body: fd,
    }),
    params: { id: String(NPO_ID) },
    context: {
      get: (k: unknown) =>
        k === admin_ctx
          ? NPO_ID
          : k === user_ctx
            ? { id: "u1", email: "admin@test.com" }
            : undefined,
    },
  });
};

beforeEach(() => {
  q.npo_get.mockReset();
  q.npo_admin_tx.mockReset();
  vi.mocked(enqueue).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("invite member", () => {
  it("throws 404 for a nonprofit that does not exist and invites no one", async () => {
    q.npo_get.mockResolvedValue(undefined);

    const thrown = await call().then(
      () => undefined,
      (e: unknown) => e
    );

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(404);
    expect(q.npo_admin_tx).not.toHaveBeenCalled();
  });

  // invites are per (invitee, npo) and per send: the dedupe needs both
  it("queues the invite email for this nonprofit, stamped with when it was sent", async () => {
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-10-02T12:30:45.678Z"),
    });
    q.npo_get.mockResolvedValue({ id: NPO_ID, name: "Save The Rainforest" });

    await call();

    expect(enqueue).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        id: "invite-email",
        payload: expect.objectContaining({
          invitee: "ada@test.com",
          npo_id: NPO_ID,
          npo_name: "Save The Rainforest",
          sent_at: "2026-10-02T12:30:45.678Z",
        }),
        dedupe: `invite_ada@test.com_${NPO_ID}_2026-10-02T123045.678Z`,
      })
    );
  });

  it("queues a re-invite to the same person as its own email", async () => {
    q.npo_get.mockResolvedValue({ id: NPO_ID, name: "Save The Rainforest" });
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-10-02T12:30:00.000Z"),
    });
    await call();
    vi.setSystemTime(new Date("2026-10-02T12:31:00.000Z"));
    await call();

    const [first, second] = vi
      .mocked(enqueue)
      .mock.calls.map(([m]) => m.dedupe);
    expect(second).not.toBe(first);
  });
});
