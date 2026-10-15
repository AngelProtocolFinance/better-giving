#!/usr/bin/env node
// drive apps/platform in headless chromium the way a user does, one flow at a
// time, and write proof: $VERIFY_OUT/results.json, <flow>.png, <flow>.aria.txt,
// <flow>.log.
//   node drive.mjs                  # every flow
//   node drive.mjs home donate-card # named flows
//   node drive.mjs --list
//   node drive.mjs --check-map      # features/, README links, and FLOWS agree
// exit 0 = every selected flow passed; 1 = a flow failed, or the feature map
// disagrees; 2 = a flow was blocked (needs secrets) and nothing failed.
// run from anywhere; resolves playwright from apps/platform.
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const APP = path.resolve(HERE, "../../../../apps/platform");
const FEATURE_DIR = path.resolve(HERE, "../features");
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
const HOME_TITLE = "Fundraising Platform for Nonprofits - Better Giving";

class Blocked extends Error {}
const expect_ok = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

// A cold `react-router dev` full-reloads the first time the footer scrolls
// into view, because that prefetches `/donate/1` and Vite optimizes new
// dependencies. The reload cancels the click and leaves the browser on `/`.
// Retry the same click. This is not a second entry point and not a direct load.
const open_link = async (page, locate, pattern) => {
  let last = page.url();
  for (let attempt = 1; attempt <= 3; attempt++) {
    await locate().click();
    try {
      await page.waitForURL(pattern, {
        timeout: attempt < 3 ? 20_000 : 120_000,
      });
      return attempt;
    } catch (err) {
      last = page.url();
      if (pattern.test(new URL(last).pathname)) return attempt;
      if (attempt === 3) {
        throw new Error(`${err.message} (still at ${last})`);
      }
      await page.waitForLoadState("load", { timeout: 30_000 }).catch(() => {});
    }
  }
  return 3;
};

const readme_ids = () => {
  const readme = fs.readFileSync(path.join(FEATURE_DIR, "README.md"), "utf8");
  return [
    ...new Set(
      [...readme.matchAll(/\]\((?:\.\/)?([a-z0-9-]+)\.md\)/g)].map((m) => m[1])
    ),
  ];
};

// features/<id>.md, a README link to that file, and a FLOWS key are one set.
// a pass does not paper over a missing side of that set.
const assert_map = (flows) => {
  const files = fs
    .readdirSync(FEATURE_DIR)
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .map((name) => name.slice(0, -3))
    .sort();
  const keys = Object.keys(flows).sort();
  const linked = readme_ids().sort();
  const problems = [];
  const missing = (have, want) => have.filter((id) => !want.includes(id));
  const no_drive = missing(files, keys);
  const no_file = missing(keys, files);
  const no_index = missing(keys, linked);
  const link_without_drive = missing(linked, keys);
  const link_without_file = missing(linked, files);
  if (no_drive.length) problems.push(`no drive entry: ${no_drive.join(", ")}`);
  if (no_file.length) problems.push(`no feature file: ${no_file.join(", ")}`);
  if (no_index.length) problems.push(`README missing: ${no_index.join(", ")}`);
  if (link_without_drive.length) {
    problems.push(
      `README link is not a flow: ${link_without_drive.join(", ")}`
    );
  }
  if (link_without_file.length) {
    problems.push(
      `README link has no feature file: ${link_without_file.join(", ")}`
    );
  }
  if (problems.length) throw new Error(problems.join("; "));
};

const click_fact = (label, tries) =>
  tries > 1 ? `${label} (retried after a reload, attempt ${tries})` : label;

// each flow: ({page, log, shot, ctx}) → string[] of observed facts. throw = fail.
// `entry` is what a pass verifies. A click absent from `entry.clicked`, or a
// URL absent from `entry.loaded`, was not verified — including a listed
// feature-file entry the recipe does not take.
const FLOWS = {
  home: {
    entry: { clicked: [], loaded: ["GET /"] },
    desc: "landing page renders with header nav and a sign-in link",
    async run({ page, shot }) {
      const r = await page.goto(`${BASE}/`, {
        waitUntil: "load",
        timeout: 120_000,
      });
      expect_ok(r.status() === 200, `GET / → ${r.status()}`);
      const title = await page.title();
      expect_ok(
        title === HOME_TITLE,
        `title "${title}", expected "${HOME_TITLE}"`
      );
      // href only. the login flow clicks this control.
      const login = page
        .getByRole("banner")
        .getByRole("link", { name: "Log In", exact: true });
      await login.waitFor({ timeout: T });
      const href = await login.getAttribute("href");
      const dest = new URL(href ?? "", page.url());
      expect_ok(
        dest.origin === new URL(BASE).origin && dest.pathname === "/login",
        `login link → ${href}, expected /login`
      );
      await shot();
      return [
        `GET / → 200`,
        `title "${title}"`,
        `header Log In href → ${href} (not clicked in this flow)`,
      ];
    },
  },
  login: {
    entry: { clicked: ["header Log In"], loaded: ["GET /login"] },
    desc: "header Log In opens sign-in; a wrong password is rejected; /login also loads directly",
    async run({ page, shot }) {
      const home = await page.goto(`${BASE}/`, {
        waitUntil: "load",
        timeout: 120_000,
      });
      expect_ok(home.status() === 200, `GET / → ${home.status()}`);
      const login_link = () =>
        page
          .getByRole("banner")
          .getByRole("link", { name: "Log In", exact: true });
      const tries = await open_link(page, login_link, /\/login(?:\?|$)/);
      await page
        .getByRole("button", { name: "Continue with Google" })
        .waitFor({ timeout: T });
      await page
        .locator('input[name="email"]')
        .fill("verify-nobody@example.com");
      await page.locator('input[name="password"]').fill("Wrong-password-123!");
      await shot("filled");
      await page.getByRole("button", { name: "Log In", exact: true }).click();
      const err = page.getByText(/invalid email or password/i).first();
      await err.waitFor({ timeout: T });
      const msg = (await err.innerText()).trim().slice(0, 160);
      await shot();
      expect_ok(
        new URL(page.url()).pathname.startsWith("/login"),
        `navigated away to ${page.url()}`
      );
      const direct = await page.goto(`${BASE}/login`, {
        waitUntil: "load",
        timeout: 120_000,
      });
      expect_ok(direct.status() === 200, `GET /login → ${direct.status()}`);
      await page
        .getByRole("button", { name: "Continue with Google" })
        .waitFor({ timeout: T });
      await shot("direct");
      return [
        click_fact("header Log In click → /login", tries),
        "google + email/password form present",
        `bad creds → stayed on /login, error "${msg}"`,
        "direct GET /login → 200",
      ];
    },
  },
  marketplace: {
    entry: { clicked: ["footer Marketplace"], loaded: ["GET /marketplace"] },
    desc: "footer Marketplace opens the list; /marketplace also loads directly; the seeded nonprofit is listed",
    async run({ page, shot }) {
      const home = await page.goto(`${BASE}/`, {
        waitUntil: "load",
        timeout: 120_000,
      });
      expect_ok(home.status() === 200, `GET / → ${home.status()}`);
      const marketplace_link = () =>
        page
          .getByRole("contentinfo")
          .getByRole("link", { name: "Marketplace", exact: true });
      const tries = await open_link(
        page,
        marketplace_link,
        /\/marketplace(?:\?|$)/
      );
      const card = page.getByText("Verify Test Nonprofit").first();
      await card.waitFor({ timeout: T });
      await shot();
      const direct = await page.goto(`${BASE}/marketplace`, {
        waitUntil: "load",
        timeout: 120_000,
      });
      expect_ok(
        direct.status() === 200,
        `GET /marketplace → ${direct.status()}`
      );
      await card.waitFor({ timeout: T });
      await shot("direct");
      return [
        click_fact("footer Marketplace click → /marketplace", tries),
        "direct GET /marketplace → 200",
        "seeded 'Verify Test Nonprofit' card visible (db read path works)",
      ];
    },
  },
  "donate-card": {
    entry: { clicked: [], loaded: ["GET /donate/:id"] },
    desc: "donate form for the seeded npo, loaded directly: pick amount → card → donor info → payment step (stripe)",
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
        `direct GET /donate/${NPO} → 200`,
        `GET /api/currencies → ${cur.status()}`,
        "amount +100 USD → Continue with Card → donor info → Continue",
        "payment step: 'Your donation summary', Total donation $100.00",
        "marketplace card Donate was not clicked",
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
      await shot("4-card");
      facts.push("stripe payment element accepted test card 4242…");
      return facts;
    },
  },
  "smoke-paths": {
    entry: {
      clicked: [],
      loaded: ["GET /", "GET /api/currencies", "GET /form-embed.js"],
    },
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
try {
  assert_map(FLOWS);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
if (args.includes("--check-map")) {
  console.log("ok   features/, README links, and drive.mjs agree");
  process.exit(0);
}
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

const { chromium } = createRequire(path.join(APP, "package.json"))(
  "playwright"
);
fs.mkdirSync(OUT, { recursive: true });
const env_file = path.join(APP, ".env.verify");
const pk = fs.existsSync(env_file)
  ? ((fs.readFileSync(env_file, "utf8").match(/^VITE_STRIPE_PK=(.*)$/m) ??
      [])[1] ?? "")
  : "";
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
  const aria = [];
  const shot = async (tag) => {
    const stem = `${name}${tag ? `-${tag}` : ""}`;
    const png = path.join(OUT, `${stem}.png`);
    const tree = path.join(OUT, `${stem}.aria.txt`);
    await page.screenshot({ path: png, fullPage: true });
    shots.push(png);
    const snapshot = await page.locator("body").ariaSnapshot();
    fs.writeFileSync(
      tree,
      snapshot.endsWith("\n") ? snapshot : `${snapshot}\n`
    );
    aria.push(tree);
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
    entry: FLOWS[name].entry,
    status,
    ms: Date.now() - t0,
    facts,
    error,
    screenshots: shots,
    aria,
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
