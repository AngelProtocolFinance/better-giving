#!/usr/bin/env node
// drive apps/platform the way a visitor does, one feature at a time.
//   node drive.mjs --list
//   node drive.mjs --check-map
//   node drive.mjs landing sign-in
// exit 0 pass, 1 a feature failed, 2 only unreachable (missing secret).
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, "../../../..");
const APP = path.join(ROOT, "apps/platform");
const FEATURE_DIR = path.resolve(HERE, "../features");
const STATE = process.env.VERIFY_STATE ?? "/tmp/bg-verify-cursor";
const PORT =
  process.env.VERIFY_PORT ??
  (fs.existsSync(`${STATE}/port`)
    ? fs.readFileSync(`${STATE}/port`, "utf8").trim()
    : "4200");
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.resolve(
  process.env.VERIFY_OUT ?? "/tmp/verify-platform-cursor-out"
);
const NPO_NAME = "Verify Test Nonprofit";
const HOME_TITLE = "Fundraising Platform for Nonprofits - Better Giving";
const T = 60_000;

class Unreachable extends Error {}

const expect_ok = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

// A cold `react-router dev` full-reloads when it first optimizes a route that
// the footer prefetches (the Marketplace click scrolls `/donate/1` into view).
// That reload cancels the client navigation and leaves the browser on `/`.
// Retry the same click. This is not a second entry point.
const open_link = async (page, locate, pattern) => {
  let last = page.url();
  for (let attempt = 1; attempt <= 3; attempt++) {
    await locate().click();
    try {
      await page.waitForURL(pattern, {
        timeout: attempt < 3 ? 20_000 : 120_000,
      });
      return;
    } catch (err) {
      last = page.url();
      if (pattern.test(new URL(last).pathname)) return;
      if (attempt === 3) {
        throw new Error(`${err.message} (still at ${last})`);
      }
      await page.waitForLoadState("load", { timeout: 30_000 }).catch(() => {});
    }
  }
};

const readme_lists = (id) => {
  const readme = fs.readFileSync(path.join(FEATURE_DIR, "README.md"), "utf8");
  return readme.includes(`(./${id}.md)`);
};

const assert_map = (features) => {
  const files = fs
    .readdirSync(FEATURE_DIR)
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .map((name) => name.slice(0, -3))
    .sort();
  const keys = Object.keys(features).sort();
  const problems = [];
  const no_drive = files.filter((id) => !keys.includes(id));
  const no_file = keys.filter((id) => !files.includes(id));
  const no_index = keys.filter((id) => !readme_lists(id));
  if (no_drive.length) problems.push(`no drive entry: ${no_drive.join(", ")}`);
  if (no_file.length) problems.push(`no feature file: ${no_file.join(", ")}`);
  if (no_index.length) problems.push(`README missing: ${no_index.join(", ")}`);
  if (problems.length) throw new Error(problems.join("; "));
};

const FEATURES = {
  landing: {
    entry: "open /",
    desc: "marketing home renders and its header sign-in link points at /login",
    async run({ page, snap }) {
      const response = await page.goto(`${BASE}/`, {
        waitUntil: "load",
        timeout: 120_000,
      });
      expect_ok(response.status() === 200, `GET / → ${response.status()}`);
      const title = await page.title();
      expect_ok(
        title === HOME_TITLE,
        `title "${title}", expected "${HOME_TITLE}"`
      );
      const login = page.getByRole("link", { name: "Log In" });
      await login.waitFor({ timeout: T });
      const href = await login.getAttribute("href");
      const dest = new URL(href ?? "", page.url());
      expect_ok(
        dest.origin === new URL(BASE).origin && dest.pathname === "/login",
        `Log In href ${href}, expected /login`
      );
      await snap("result");
      return ["GET / → 200", `title "${title}"`, `header Log In → ${href}`];
    },
  },
  "sign-in": {
    entry: "header Log In on /",
    desc: "sign-in form rejects a wrong password and stays on /login",
    async run({ page, snap }) {
      const home = await page.goto(`${BASE}/`, {
        waitUntil: "load",
        timeout: 120_000,
      });
      expect_ok(home.status() === 200, `GET / → ${home.status()}`);
      await page.getByRole("link", { name: "Log In" }).click();
      await page.waitForURL(/\/login(?:\?|$)/, { timeout: T });
      await page
        .getByRole("button", { name: "Continue with Google" })
        .waitFor({ timeout: T });
      await page
        .getByPlaceholder("Email address")
        .fill("verify-nobody@example.com");
      await page.getByPlaceholder("Password").fill("Wrong-password-123!");
      await snap("filled");
      await page.getByRole("button", { name: "Log In", exact: true }).click();
      const err = page.getByText("Invalid email or password").first();
      await err.waitFor({ timeout: T });
      const msg = (await err.innerText()).trim();
      await snap("result");
      expect_ok(
        new URL(page.url()).pathname === "/login",
        `left /login for ${page.url()}`
      );
      return [
        "header Log In → /login",
        "Continue with Google and email/password form present",
        `wrong password → stayed on /login, "${msg}"`,
      ];
    },
  },
  marketplace: {
    entry: "footer Marketplace link on /",
    desc: "marketplace lists the seeded nonprofit",
    async run({ page, snap }) {
      const home = await page.goto(`${BASE}/`, {
        waitUntil: "load",
        timeout: 120_000,
      });
      expect_ok(home.status() === 200, `GET / → ${home.status()}`);
      const marketplace_link = () =>
        page
          .getByRole("contentinfo")
          .getByRole("link", { name: "Marketplace", exact: true });
      await open_link(page, marketplace_link, /\/marketplace(?:\?|$)/);
      await page
        .getByRole("heading", { name: NPO_NAME, exact: true })
        .waitFor({ timeout: T });
      await snap("result");
      return [
        "footer Marketplace → /marketplace",
        `heading "${NPO_NAME}" visible (seeded row)`,
      ];
    },
  },
  donate: {
    entry: "Donate on the seeded marketplace card",
    desc: "amount, card method, donor info, and the $100 summary; card entry needs test keys",
    async run({ page, snap }) {
      const home = await page.goto(`${BASE}/`, {
        waitUntil: "load",
        timeout: 120_000,
      });
      expect_ok(home.status() === 200, `GET / → ${home.status()}`);
      const marketplace_link = () =>
        page
          .getByRole("contentinfo")
          .getByRole("link", { name: "Marketplace", exact: true });
      await open_link(page, marketplace_link, /\/marketplace(?:\?|$)/);
      const donate_link = () =>
        page
          .locator("div")
          .filter({
            has: page.getByRole("heading", { name: NPO_NAME, exact: true }),
          })
          .filter({
            has: page.getByRole("link", { name: "Donate", exact: true }),
          })
          .last()
          .getByRole("link", { name: "Donate", exact: true });
      await open_link(page, donate_link, /\/donate\/\d+/);
      await page.getByText(NPO_NAME).first().waitFor({ timeout: T });
      await page
        .getByRole("button", { name: "+100 USD" })
        .click({ timeout: T });
      await snap("amount");
      await page.getByRole("button", { name: "Continue with Card" }).click();
      await page.getByText("Payment information").waitFor({ timeout: T });
      await page
        .getByRole("textbox", { name: /your email/i })
        .fill("donor@example.com");
      await page.getByRole("textbox", { name: /first name/i }).fill("Verify");
      await page.getByRole("textbox", { name: /last name/i }).fill("Donor");
      await snap("donor");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByText("Your donation summary").waitFor({ timeout: T });
      await page.waitForTimeout(8_000);
      await snap("summary");
      const body = await page.locator("body").innerText();
      expect_ok(
        /Total donation[\s\S]{0,80}\$100\.00/.test(body),
        "summary does not show Total donation $100.00"
      );
      const facts = [
        "footer Marketplace → seeded card Donate → /donate/:id",
        "+100 USD → Continue with Card → donor info → Continue",
        "payment step shows Your donation summary and Total donation $100.00",
      ];
      const number = page
        .frameLocator('iframe[title*="Secure payment input"]')
        .first()
        .locator('input[name="number"]');
      const card_ready = await number
        .waitFor({ state: "visible", timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      if (!card_ready) {
        const pay_err = /couldn.t start the payment[^\n]*/i.exec(body)?.[0];
        if (pay_err) facts.push(`page shows "${pay_err.trim()}"`);
        const stub_path = `${STATE}/stripe-stub.log`;
        if (fs.existsSync(stub_path)) {
          const stub = fs.readFileSync(stub_path, "utf8");
          const calls = [
            ...new Set(
              [...stub.matchAll(/ (GET|POST|DELETE) (\S+) → 400/g)].map(
                (match) => `${match[1]} ${match[2].split("?")[0]}`
              )
            ),
          ];
          if (calls.length) {
            facts.push(`local stripe stub refused: ${calls.join(", ")}`);
          }
        }
        throw new Unreachable(
          `card entry needs VERIFY_STRIPE_SK=sk_test_… and VERIFY_STRIPE_PK=pk_test_…\n  ${facts.join("\n  ")}`
        );
      }
      await number.fill("4242424242424242", { timeout: T });
      await snap("card");
      facts.push("Stripe payment element accepted test card 4242…");
      return facts;
    },
  },
};

const args = process.argv.slice(2);
try {
  assert_map(FEATURES);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
if (args.includes("--check-map")) {
  console.log("ok   feature map matches drive.mjs");
  process.exit(0);
}
if (args.includes("--list")) {
  for (const [id, feature] of Object.entries(FEATURES)) {
    console.log(`${id.padEnd(14)} ${feature.desc}`);
  }
  process.exit(0);
}

const { chromium } = createRequire(path.join(APP, "package.json"))(
  "playwright"
);
const names = args.length ? args : Object.keys(FEATURES);
for (const name of names) {
  if (!FEATURES[name]) {
    console.error(`unknown feature "${name}"; --list shows them`);
    process.exit(64);
  }
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const results = [];
for (const name of names) {
  const feature = FEATURES[name];
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  const lines = [];
  const log = (line) => lines.push(`${new Date().toISOString()} ${line}`);
  page.on("console", (msg) =>
    log(`console.${msg.type()}: ${msg.text().slice(0, 300)}`)
  );
  page.on("pageerror", (err) => log(`pageerror: ${err.message.slice(0, 300)}`));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      log(
        `http ${response.request().method()} ${response.status()} ${response.url().slice(0, 160)}`
      );
    }
  });
  const screenshots = [];
  const aria = [];
  const snap = async (tag) => {
    const stem = `${name}-${tag}`;
    const png = path.join(OUT, `${stem}.png`);
    const tree = path.join(OUT, `${stem}.aria.txt`);
    await page.screenshot({ path: png, fullPage: true });
    fs.writeFileSync(tree, await page.locator("body").ariaSnapshot());
    screenshots.push(png);
    aria.push(tree);
  };
  const started = Date.now();
  let status;
  let facts = [];
  let error;
  try {
    facts = await feature.run({ page, snap, log });
    status = "pass";
  } catch (err) {
    status = err instanceof Unreachable ? "unreachable" : "fail";
    error = err.message.split("\n")[0];
    if (err instanceof Unreachable) {
      facts = err.message
        .split("\n")
        .slice(1)
        .map((line) => line.trim())
        .filter(Boolean);
    }
    try {
      await snap("final");
    } catch {
      log("screenshot failed");
    }
  }
  const log_path = path.join(OUT, `${name}.log`);
  fs.writeFileSync(log_path, `${lines.join("\n")}\n`);
  const result = {
    feature: name,
    entry: feature.entry,
    status,
    ms: Date.now() - started,
    facts,
    error,
    screenshots,
    aria,
    log: log_path,
  };
  results.push(result);
  console.log(
    `${status.toUpperCase().padEnd(12)} ${name}${error ? ` — ${error}` : ""}`
  );
  for (const fact of facts) console.log(`             · ${fact}`);
  await context.close();
}
await browser.close();
fs.writeFileSync(
  path.join(OUT, "results.json"),
  JSON.stringify(
    {
      base: BASE,
      at: new Date().toISOString(),
      git: process.env.VERIFY_GIT ?? null,
      results,
    },
    null,
    2
  )
);
console.log(`proof: ${OUT}/results.json`);
process.exit(
  results.some((result) => result.status === "fail")
    ? 1
    : results.some((result) => result.status === "unreachable")
      ? 2
      : 0
);
