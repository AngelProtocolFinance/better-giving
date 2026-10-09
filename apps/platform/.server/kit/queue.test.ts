import { afterEach, describe, expect, test, vi } from "vitest";

const qstash_env = vi.hoisted(() => ({
  token: "t",
  current_signing_key: "sig_current" as string | undefined,
  next_signing_key: "sig_next" as string | undefined,
}));

vi.mock("../env", () => ({
  app: { slug: "bg" },
  base_url: "https://app.test",
  stage: "test",
  qstash: qstash_env,
}));

const { receiver, verify_qstash } = await import("./queue");

const TARGET_URL = "https://app.test/api/cron/grants";

const signed = (signature: string, body = "{}") =>
  new Request(TARGET_URL, {
    method: "POST",
    headers: { "upstash-signature": signature },
    body,
  });

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const b64url_json = (v: unknown) =>
  b64url(new TextEncoder().encode(JSON.stringify(v)));

/** the HS256 jwt qstash sends: issuer, url as subject, sha256 of the body */
async function qstash_signature(key: string, body: string) {
  const enc = new TextEncoder();
  const body_hash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", enc.encode(body))
  );
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url_json({ alg: "HS256", typ: "JWT" })}.${b64url_json({
    iss: "Upstash",
    sub: TARGET_URL,
    iat: now,
    nbf: now,
    exp: now + 300,
    body: b64url(body_hash),
  })}`;
  const hmac = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", hmac, enc.encode(unsigned));
  return `${unsigned}.${b64url(new Uint8Array(sig))}`;
}

afterEach(() => {
  qstash_env.current_signing_key = "sig_current";
  qstash_env.next_signing_key = "sig_next";
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("verify_qstash", () => {
  test("answers a junk signature 401, not a thrown error", async () => {
    const res = await verify_qstash(signed("x")).catch((e: unknown) => e);

    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(401);
  });

  test("answers a verify that resolves false 401", async () => {
    // 2.10.1 only throws, but its type is Promise<boolean>
    vi.spyOn(receiver, "verify").mockResolvedValueOnce(false);

    const res = await verify_qstash(signed("x")).catch((e: unknown) => e);

    expect((res as Response).status).toBe(401);
  });

  test("answers a missing signature 401", async () => {
    const res = await verify_qstash(
      new Request("https://app.test/api/cron/grants", { method: "POST" })
    ).catch((e: unknown) => e);

    expect((res as Response).status).toBe(401);
  });

  test("returns the body of a message signed with the current key", async () => {
    const body = '{"id":"don-1"}';
    const signature = await qstash_signature("sig_current", body);

    expect(await verify_qstash(signed(signature, body))).toBe(body);
  });

  test("lets a missing-signing-keys error through as a 500, not a 401", async () => {
    qstash_env.current_signing_key = undefined;
    qstash_env.next_signing_key = undefined;
    // the receiver also falls back to these before giving up
    vi.stubEnv("QSTASH_CURRENT_SIGNING_KEY", "");
    vi.stubEnv("QSTASH_NEXT_SIGNING_KEY", "");
    vi.resetModules();
    const { verify_qstash: unkeyed } = await import("./queue");

    const res = await unkeyed(signed("x")).catch((e: unknown) => e);

    expect(res).toBeInstanceOf(Error);
    expect(String(res)).toMatch(/No signing keys/);
  });
});
