#!/usr/bin/env node
// drive apps/platform in headless chromium the way a user does, one flow at a
// time, and write proof: $VERIFY_OUT/results.json, <flow>.png, <flow>.log.
//   node drive.mjs                  # every flow
//   node drive.mjs home donate-card # named flows
//   node drive.mjs --list
// exit 0 = every selected flow passed; 1 = a flow failed; 2 = a flow was
// blocked (needs secrets) and nothing failed.
// run from anywhere; resolves playwright from apps/platform.
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const APP = path.resolve(HERE, "../../../../apps/platform");
const { chromium } = createRequire(path.join(APP, "package.json"))(
  "playwright"
);
const STATE = process.env.VERIFY_STATE ?? "/tmp/bg-verify";
const PORT =
  process.env.VERIFY_PORT ??
  (fs.existsSync(`${STATE}/port`)
    ? fs.readFileSync(`${STATE}/port`, "utf8").trim()
    : "4200");
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.resolve(process.env.VERIFY_OUT ?? "verify-out");
const NPO =
  process.env.VERIFY_NPO_ID ??
  (fs.existsSync(`${STATE}/npo_id`)
    ? fs.readFileSync(`${STATE}/npo_id`, "utf8").trim()
    : "1");
const T = 60_000;

class Blocked extends Error {}
const expect_ok = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

// each flow: ({page, log, shot, ctx}) → string[] of observed facts. throw = fail.
const FLOWS = {
  home: {
    desc: "landing page renders with header nav and a sign-in link",
    async run({ page, shot }) {
      const r = await page.goto(`${BASE}/`, {
        waitUntil: "load",
        timeout: 120_000,
      });
      expect_ok(r.status() === 200, `GET / → ${r.status()}`);
      const title = await page.title();
      const login = page
        .getByRole("link", { name: /log ?in|sign ?in/i })
        .first();
      await login.waitFor({ timeout: T });
      await shot();
      return [
        `GET / → 200`,
        `title "${title}"`,
        `login link → ${await login.getAttribute("href")}`,
      ];
    },
  },
  login: {
    desc: "sign-in page renders; a wrong password is rejected with a visible error",
    async run({ page, shot }) {
      const r = await page.goto(`${BASE}/login`, {
        waitUntil: "load",
        timeout: 120_000,
      });
      expect_ok(r.status() === 200, `GET /login → ${r.status()}`);
      await page
        .getByRole("button", { name: "Continue with Google" })
        .waitFor({ timeout: T });
      await page
        .locator('input[name="email"]')
        .fill("verify-nobody@example.com");
      await page.locator('input[name="password"]').fill("Wrong-password-123!");
      await shot("filled");
      await page.getByRole("button", { name: "Log In" }).click();
      // rejected = still on /login and some alert/error text appears
      const err = page.getByText(/invalid email or password/i).first();
      await err.waitFor({ timeout: T });
      const msg = (await err.innerText()).trim().slice(0, 160);
      await shot();
      expect_ok(
        new URL(page.url()).pathname.startsWith("/login"),
        `navigated away to ${page.url()}`
      );
      return [
        "GET /login → 200",
        "google + email/password form present",
        `bad creds → stayed on /login, error "${msg}"`,
      ];
    },
  },
  marketplace: {
    desc: "marketplace lists the seeded nonprofit from postgres",
    async run({ page, shot }) {
      const r = await page.goto(`${BASE}/marketplace`, {
        waitUntil: "load",
        timeout: 120_000,
      });
      expect_ok(r.status() === 200, `GET /marketplace → ${r.status()}`);
      const card = page.getByText("Verify Test Nonprofit").first();
      await card.waitFor({ timeout: T });
      await shot();
      return [
        "GET /marketplace → 200",
        "seeded 'Verify Test Nonprofit' card visible (db read path works)",
      ];
    },
  },
  "donate-card": {
    desc: "donate form for the seeded npo: pick amount → card → donor info → payment step (stripe)",
    async run({ page, shot, ctx }) {
      const r = await page.goto(`${BASE}/donate/${NPO}`, {
        waitUntil: "load",
        timeout: 120_000,
      });
      expect_ok(r.status() === 200, `GET /donate/${NPO} → ${r.status()}`);
      await page
        .getByText("Verify Test Nonprofit")
        .first()
        .waitFor({ timeout: T });
      const cur = await page.request.get(`${BASE}/api/currencies`);
      await page
        .getByRole("button", { name: "+100 USD" })
        .click({ timeout: T });
      await shot("1-amount");
      await page.getByRole("button", { name: /Continue with Card/ }).click();
      await page.getByText("Payment information").waitFor({ timeout: T });
      await page.locator('input[name="email"]').fill("donor@example.com");
      await page.locator('input[name="first_name"]').fill("Verify");
      await page.locator('input[name="last_name"]').fill("Donor");
      await shot("2-donor");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      // payment step: donation summary, then stripe creates a payment intent
      // (server) and mounts the payment element (stripe.js iframe)
      await page.getByText("Your donation summary").waitFor({ timeout: T });
      await page.waitForTimeout(8000);
      await shot("3-payment");
      const body = await page.locator("body").innerText();
      expect_ok(
        /Total donation\s*\$100\.00/.test(body),
        "summary doesn't show Total donation $100.00"
      );
      const facts = [
        `GET /donate/${NPO} → 200`,
        `GET /api/currencies → ${cur.status()}`,
        "amount +100 USD → Continue with Card → donor info → Continue",
        "payment step: 'Your donation summary', Total donation $100.00",
      ];
      const pay_err = /couldn.t start the payment[^\n]*/i.exec(body)?.[0];
      const stub = fs.existsSync(`${STATE}/stripe-stub.log`)
        ? fs.readFileSync(`${STATE}/stripe-stub.log`, "utf8")
        : "";
      const stubbed = [...stub.matchAll(/ (GET|POST|DELETE) (\S+) → 400/g)].map(
        (m) => `${m[1]} ${m[2].split("?")[0]}`
      );
      const pi_stubbed = stubbed.length > 0;
      if (pay_err && (ctx.pk.includes("test-only") || pi_stubbed)) {
        facts.push(`shows "${pay_err.trim()}"`);
        if (pi_stubbed)
          facts.push(
            `server stripe calls refused by the local stub (filler STRIPE_SECRET_KEY): ${[...new Set(stubbed)].join(", ")}`
          );
        throw new Blocked(
          `payment step reached; card entry needs a real pk_test_/sk_test_ pair\n  ${facts.join("\n  ")}`
        );
      }
      expect_ok(!pay_err, `payment failed to start with real keys: ${pay_err}`);
      const card = page
        .frameLocator('iframe[title*="Secure payment input"]')
        .first();
      await card
        .locator('input[name="number"]')
        .fill("4242424242424242", { timeout: T });
      facts.push("stripe payment element accepted test card 4242…");
      return facts;
    },
  },
  "smoke-paths": {
    desc: "smoke.yml's paths answer 2xx/3xx locally: /, /api/currencies, /form-embed.js",
    async run({ page }) {
      const facts = [];
      for (const p of ["/", "/api/currencies", "/form-embed.js"]) {
        const r = await page.request.get(`${BASE}${p}`, { timeout: 120_000 });
        facts.push(`${p} → ${r.status()}`);
        expect_ok(r.status() < 400, `${p} → ${r.status()}`);
      }
      return facts;
    },
  },
};

const args = process.argv.slice(2);
if (args.includes("--list")) {
  for (const [k, f] of Object.entries(FLOWS))
    console.log(`${k.padEnd(14)} ${f.desc}`);
  process.exit(0);
}
const names = args.length ? args : Object.keys(FLOWS);
for (const n of names)
  if (!FLOWS[n]) {
    console.error(`unknown flow "${n}"; --list shows them`);
    process.exit(64);
  }

fs.mkdirSync(OUT, { recursive: true });
const pk =
  (fs
    .readFileSync(path.join(APP, ".env.verify"), "utf8")
    .match(/^VITE_STRIPE_PK=(.*)$/m) ?? [])[1] ?? "";
const browser = await chromium.launch();
const results = [];
for (const name of names) {
  const ctxb = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctxb.newPage();
  const lines = [];
  const net = [];
  const log = (s) => lines.push(`${new Date().toISOString()} ${s}`);
  page.on("console", (m) =>
    log(`console.${m.type()}: ${m.text().slice(0, 300)}`)
  );
  page.on("pageerror", (e) => log(`pageerror: ${e.message.slice(0, 300)}`));
  page.on("response", (r) => {
    if (r.status() >= 400) {
      const s = `${r.request().method()} ${r.status()} ${r.url().slice(0, 160)}`;
      net.push(s);
      log(`http ${s}`);
    }
  });
  const shots = [];
  const shot = async (tag) => {
    const f = path.join(OUT, `${name}${tag ? `-${tag}` : ""}.png`);
    await page.screenshot({ path: f, fullPage: true });
    shots.push(f);
  };
  const t0 = Date.now();
  let status,
    facts = [],
    error;
  try {
    facts = await FLOWS[name].run({ page, log, shot, ctx: { net, pk } });
    status = "pass";
  } catch (e) {
    status = e instanceof Blocked ? "blocked" : "fail";
    error = e.message.split("\n")[0];
    if (e instanceof Blocked)
      facts = e.message
        .split("\n")
        .slice(1)
        .map((s) => s.trim());
    try {
      await shot("final");
    } catch {}
  }
  fs.writeFileSync(path.join(OUT, `${name}.log`), `${lines.join("\n")}\n`);
  const r = {
    flow: name,
    status,
    ms: Date.now() - t0,
    facts,
    error,
    screenshots: shots,
    log: path.join(OUT, `${name}.log`),
  };
  results.push(r);
  console.log(
    `${status.toUpperCase().padEnd(7)} ${name}${error ? ` — ${error}` : ""}`
  );
  for (const f of facts) console.log(`        · ${f}`);
  await ctxb.close();
}
await browser.close();
const summary = {
  base: BASE,
  at: new Date().toISOString(),
  git: process.env.VERIFY_GIT ?? null,
  results,
};
fs.writeFileSync(
  path.join(OUT, "results.json"),
  JSON.stringify(summary, null, 2)
);
console.log(`proof: ${OUT}/results.json`);
process.exit(
  results.some((r) => r.status === "fail")
    ? 1
    : results.some((r) => r.status === "blocked")
      ? 2
      : 0
);
