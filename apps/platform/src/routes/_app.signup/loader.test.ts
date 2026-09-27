import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: undefined as object | undefined }));

vi.mock("#/.server/auth", () => ({ get_session: vi.fn(async () => session) }));

import { loader } from "./loader";

const req = (redirect: string) =>
  new Request(
    `https://app.test/signup?redirect=${encodeURIComponent(redirect)}`
  );

beforeEach(() => {
  session.user = undefined;
});

describe("/signup loader ?redirect=", () => {
  it("sends a signed-in visitor home, not off-site", async () => {
    session.user = { id: "u1" };
    const res = (await loader({
      request: req("https://evil.example"),
    } as any)) as Response;
    expect(res.headers.get("location")).toBe("/marketplace");
  });

  it("hands the page a safe return path to post back with", async () => {
    expect(await loader({ request: req("/\\evil.example") } as any)).toBe("/");
    expect(await loader({ request: req("/register/abc") } as any)).toBe(
      "/register/abc"
    );
  });
});
