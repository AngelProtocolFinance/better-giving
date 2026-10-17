// verification scaffolding — while BLOB_READ_WRITE_TOKEN is .env.test filler,
// @vercel/blob put() talks to this process instead of vercel.com. the sdk
// reads VERCEL_BLOB_API_URL at request time. a real token leaves that unset.
// every stubbed call is logged to $VERIFY_STATE/blob-stub.log.
import fs from "node:fs";
import http from "node:http";

const token = process.env.BLOB_READ_WRITE_TOKEN ?? "";
const filler = !token || token.includes("test-only");
if (filler && !globalThis.__verify_blob) {
  globalThis.__verify_blob = true;
  const log = `${process.env.VERIFY_STATE ?? "/tmp/bg-verify"}/blob-stub.log`;
  const port = process.env.VERIFY_PORT ?? "4200";
  const public_url = `http://127.0.0.1:${port}/logo.png`;
  const srv = http.createServer((q, r) => {
    const pathname = new URL(q.url ?? "/", "http://127.0.0.1").searchParams.get(
      "pathname"
    );
    try {
      fs.appendFileSync(
        log,
        `${new Date().toISOString()} ${q.method} ${q.url} → 200\n`
      );
    } catch {}
    q.resume();
    q.on("end", () => {
      r.writeHead(200, { "content-type": "application/json" });
      r.end(
        JSON.stringify({
          url: public_url,
          downloadUrl: `${public_url}?download=1`,
          pathname: pathname ?? "u/upload.png",
          contentType: "image/png",
          contentDisposition: "inline",
          etag: "verify",
        })
      );
    });
  });
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  srv.unref();
  process.env.VERCEL_BLOB_API_URL = `http://127.0.0.1:${srv.address().port}`;
  console.error(
    `[blob-stub] vercel blob → ${process.env.VERCEL_BLOB_API_URL} (filler token)`
  );
}
