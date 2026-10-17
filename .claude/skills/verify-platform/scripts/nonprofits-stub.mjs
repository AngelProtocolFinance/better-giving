// verification scaffolding — preload that answers fetch() to
// nonprofits.better.giving in-process, but only while NONPROFITS_API_KEY is
// the .env.test filler. any other key leaves fetch alone. every stubbed call
// is logged to $VERIFY_STATE/nonprofits-stub.log.
import fs from "node:fs";

const FILLER = "test-only-not-a-real-nonprofits-key";
const key = process.env.NONPROFITS_API_KEY ?? "";
if (key === FILLER && !globalThis.__verify_nonprofits) {
  globalThis.__verify_nonprofits = true;
  const log = `${process.env.VERIFY_STATE ?? "/tmp/bg-verify"}/nonprofits-stub.log`;
  const eligible = {
    ein: "990000001",
    name: "Fixture Eligible Nonprofit",
    is501c3: true,
    deductible: true,
    revoked: false,
    revocationDate: null,
    provenance: "irs",
    address: {
      street: "1 Fixture",
      city: "Austin",
      state: "TX",
      zip: "78701",
    },
  };
  const revoked = {
    ein: "990000002",
    name: "Fixture Revoked Org",
    is501c3: true,
    deductible: true,
    revoked: true,
    revocationDate: "2020-01-01",
    provenance: "irs",
    address: {
      street: "2 Fixture",
      city: "Dallas",
      state: "TX",
      zip: "75201",
    },
  };
  const search_row = (org) => ({
    ein: org.ein,
    name: org.name,
    city: org.address.city,
    state: org.address.state,
    is501c3: org.is501c3,
    deductible: org.deductible,
    revoked: org.revoked,
    revocationDate: org.revocationDate,
    provenance: org.provenance,
  });
  const answer = (url) => {
    if (url.pathname === "/v1/search") {
      return [
        200,
        {
          query: url.searchParams.get("q") ?? "",
          limit: Number(url.searchParams.get("limit") ?? 10),
          results: [search_row(eligible), search_row(revoked)],
        },
      ];
    }
    if (url.pathname === "/v1/orgs/990000001") return [200, eligible];
    if (url.pathname === "/v1/orgs/990000002") return [200, revoked];
    return [404, { code: "not_found" }];
  };
  const orig = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    let url;
    try {
      url = new URL(raw);
    } catch {
      return orig(input, init);
    }
    if (url.hostname !== "nonprofits.better.giving") return orig(input, init);
    const method = (
      init?.method ??
      (typeof input === "string" || input instanceof URL ? "GET" : input.method)
    ).toUpperCase();
    const [status, body] = answer(url);
    try {
      fs.appendFileSync(
        log,
        `${new Date().toISOString()} ${method} ${url.pathname}${url.search} → ${status}\n`
      );
    } catch {}
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  console.error(
    "[nonprofits-stub] nonprofits.better.giving → local stub (filler key)"
  );
}
