import { describe, expect, test, vi } from "vitest";

vi.mock("../env", () => ({
  app: { slug: "bg" },
  base_url: "https://app.test",
  stage: "test",
  qstash: {
    token: "t",
    current_signing_key: "sig_current",
    next_signing_key: "sig_next",
  },
}));

const { verify_qstash } = await import("./queue");

const signed = (signature: string) =>
  new Request("https://app.test/api/cron/grants", {
    method: "POST",
    headers: { "upstash-signature": signature },
    body: "{}",
  });

describe("verify_qstash", () => {
  test("answers a junk signature 401, not a thrown error", async () => {
    const res = await verify_qstash(signed("x")).catch((e: unknown) => e);

    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(401);
  });

  test("answers a missing signature 401", async () => {
    const res = await verify_qstash(
      new Request("https://app.test/api/cron/grants", { method: "POST" })
    ).catch((e: unknown) => e);

    expect((res as Response).status).toBe(401);
  });
});
