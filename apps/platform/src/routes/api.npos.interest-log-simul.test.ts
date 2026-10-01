import { describe, expect, test, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as null | { role: string } }));
vi.mock("#/.server/auth", () => ({
  get_session: async () => session,
  to_auth: vi.fn(),
}));
const simulate = vi.hoisted(() => vi.fn());
vi.mock("#/.server/npos-interest-share", () => ({
  npo_interest_shares: simulate,
}));

import { action } from "./api.npos.interest-log-simul";

describe("api.npos.interest-log-simul action", () => {
  test("answers a non-admin with a 403 response and runs no simulation", async () => {
    session.user = { role: "user" };
    const request = new Request("https://x/api/npos/interest-log-simul", {
      method: "POST",
      body: "{}",
    });
    const res = await action({ request } as any);

    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(403);
    expect(simulate).not.toHaveBeenCalled();
  });

  test("answers a body that isn't json with 400 and runs no simulation", async () => {
    session.user = { role: "admin" };
    const request = new Request("https://x/api/npos/interest-log-simul", {
      method: "POST",
      body: "not json",
    });
    const res = await action({ request } as any);

    expect((res as Response).status).toBe(400);
    expect(simulate).not.toHaveBeenCalled();
  });
});
