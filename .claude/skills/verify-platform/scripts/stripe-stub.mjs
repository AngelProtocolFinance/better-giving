// verification scaffolding — preload that answers the SERVER-side stripe sdk
// from a local stub, but only while STRIPE_SECRET_KEY is .env.test filler
// (contains "test-only"). with a real sk_test_ key it does nothing and the sdk
// talks to stripe test mode. every stubbed call is logged to
// $VERIFY_STATE/stripe-stub.log so a proof can show what was faked.
// stubbed: GET /v1/country_specs/:cc. anything else → stripe-shaped 400.
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";

const key = process.env.STRIPE_SECRET_KEY ?? "";
const filler = !key || key.includes("test-only");
if (filler && !globalThis.__verify_stripe) {
  globalThis.__verify_stripe = true;
  const log = `${process.env.VERIFY_STATE ?? "/tmp/bg-verify"}/stripe-stub.log`;
  const CURR = ["usd", "eur", "gbp", "php", "aud", "cad"];
  const answer = (method, path) => {
    const m = path.match(/^\/v1\/country_specs\/([A-Z]{2})/);
    if (method === "GET" && m)
      return [
        200,
        {
          id: m[1],
          object: "country_spec",
          default_currency: "usd",
          supported_payment_currencies: CURR,
        },
      ];
    return [
      400,
      {
        error: {
          type: "invalid_request_error",
          message: `verify stripe stub: ${method} ${path} not stubbed — use a real sk_test_ key`,
        },
      },
    ];
  };
  const srv = http.createServer((q, r) => {
    const [status, body] = answer(q.method, q.url);
    try {
      fs.appendFileSync(
        log,
        `${new Date().toISOString()} ${q.method} ${q.url} → ${status}\n`
      );
    } catch {}
    q.resume();
    q.on("end", () => {
      r.writeHead(status, {
        "content-type": "application/json",
        "request-id": "req_verify_stub",
      });
      r.end(JSON.stringify(body));
    });
  });
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  srv.unref();
  const stub_port = srv.address().port;
  const orig = https.request;
  https.request = function (opts, cb, ...more) {
    const o =
      typeof opts === "string" || opts instanceof URL ? new URL(opts) : opts;
    const host = o.hostname ?? o.host;
    if (host !== "api.stripe.com") return orig.call(this, opts, cb, ...more);
    // a real ClientRequest against the in-process stub, so the sdk's own
    // response handling runs unchanged
    const {
      agent: _a,
      host: _h,
      hostname: _hn,
      port: _p,
      protocol: _pr,
      ...rest
    } = o;
    const req = http.request(
      { ...rest, host: "127.0.0.1", port: stub_port },
      cb
    );
    // the sdk writes its body on `secureConnect`; a plain socket only emits
    // `connect`, so relay it
    req.once("socket", (sock) =>
      sock.once("connect", () => sock.emit("secureConnect"))
    );
    return req;
  };
  syncBuiltinESMExports();
  console.error("[stripe-stub] server-side stripe → local stub (filler key)");
}
