#!/usr/bin/env node
// keyless GET /connector/v1/hello. not a browser flow: no login, no exchange,
// no bearer token.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

process.stdout.on("error", (e) => {
  if (e.code === "EPIPE") process.exit(0);
  throw e;
});

const HELP =
  "Checks keyless GET /connector/v1/hello, keyless 401s on MVP paths, and unknown_action on phase-2 paths against CONNECTOR_ORIGIN. CONNECTOR_KEY optionally checks list reads. Does not run the browser Allow flow.";

const TOOLS = [
  "list_campaigns",
  "get_campaign",
  "create_campaign",
  "get_donation_page",
  "get_block_catalog",
  "list_forms",
  "get_form",
  "get_results",
  "list_donations",
  "list_donors",
  "get_donor",
  "list_recurring_gifts",
];

const KEYLESS = [
  ["GET", "/connector/v1/campaigns"],
  ["POST", "/connector/v1/campaigns"],
  ["GET", "/connector/v1/campaigns/some-id"],
  ["GET", "/connector/v1/donation-page"],
  ["GET", "/connector/v1/blocks/catalog"],
  ["GET", "/connector/v1/forms"],
  ["GET", "/connector/v1/forms/some-id"],
  ["GET", "/connector/v1/results"],
  ["GET", "/connector/v1/donations"],
  ["GET", "/connector/v1/donors"],
  ["GET", "/connector/v1/donors/some-id"],
  ["GET", "/connector/v1/recurring"],
];

const UNSERVED = [
  ["POST", "/connector/v1/donations"],
  ["POST", "/connector/v1/forms"],
  ["PATCH", "/connector/v1/campaigns/some-id/blocks"],
  ["GET", "/connector/v1/programs"],
  ["POST", "/connector/v1/campaigns/some-id/unpublish"],
];

const LISTS = [
  "/connector/v1/campaigns",
  "/connector/v1/forms",
  "/connector/v1/donations",
  "/connector/v1/donors",
  "/connector/v1/recurring",
];

const usage = (message) => {
  process.stderr.write(
    `contract.mjs: ${message}\nRun 'contract.mjs --help' for usage.\n`
  );
  process.exitCode = 2;
};

const write_json = (dir, name, body) => {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`);
};

const origin_of = (raw) => {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.pathname !== "/" || url.search || url.hash) return null;
  return url.origin;
};

const main = async () => {
  let args;
  try {
    args = parseArgs({
      options: { help: { type: "boolean" } },
      strict: true,
      allowPositionals: false,
    });
  } catch (err) {
    if (!err.code?.startsWith("ERR_PARSE_ARGS_")) throw err;
    usage(err.message);
    return;
  }
  if (args.values.help) {
    process.stdout.write(`${HELP}\n`);
    return;
  }

  const raw = (process.env.CONNECTOR_ORIGIN ?? "").trim();
  const out = process.env.VERIFY_OUT
    ? path.resolve(process.env.VERIFY_OUT)
    : "";
  if (!raw) {
    if (out) {
      write_json(out, "results.json", {
        status: "blocked",
        reason: "CONNECTOR_ORIGIN is required",
      });
    }
    process.stderr.write("CONNECTOR_ORIGIN is required\n");
    process.exitCode = 2;
    return;
  }

  const origin = origin_of(raw);
  if (!origin) {
    usage("CONNECTOR_ORIGIN must be an origin with no path");
    return;
  }

  const call = async (method, path, key) => {
    const headers = { accept: "application/json" };
    if (key) headers.authorization = `Bearer ${key}`;
    const res = await fetch(`${origin}${path}`, {
      method,
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    return {
      status: res.status,
      body,
      redirected: res.status >= 300 && res.status < 400,
    };
  };

  const problems = [];
  let status = null;
  let service = false;
  let contract = false;
  let actions = false;
  try {
    const hello = await call("GET", "/connector/v1/hello");
    status = hello.status;
    service = hello.body?.service === "better-giving";
    contract = hello.body?.contract === 1;
    const listed = hello.body?.actions;
    actions =
      Array.isArray(listed) && TOOLS.every((tool) => listed.includes(tool));
    if (status !== 200 || !service || !contract || !actions) {
      problems.push("hello");
    }
    if (hello.redirected || hello.status === 405) problems.push("hello-method");

    for (const [method, path] of KEYLESS) {
      const res = await call(method, path);
      if (
        res.status !== 401 ||
        res.body?.code !== "key_refused" ||
        res.redirected ||
        res.status === 405
      ) {
        problems.push(`${method} ${path} keyless ${res.status}`);
      }
    }
    for (const [method, path] of UNSERVED) {
      const res = await call(method, path);
      if (
        res.status !== 404 ||
        res.body?.code !== "unknown_action" ||
        res.redirected ||
        res.status === 405
      ) {
        problems.push(`${method} ${path} unserved ${res.status}`);
      }
    }

    const key = (process.env.CONNECTOR_KEY ?? "").trim();
    if (key) {
      for (const path of LISTS) {
        const res = await call("GET", path, key);
        if (
          res.status !== 200 ||
          !Array.isArray(res.body?.data) ||
          res.redirected
        ) {
          problems.push(`GET ${path} keyed ${res.status}`);
        }
      }
    }
  } catch (err) {
    problems.push(err.cause?.code ?? err.name ?? "fetch failed");
  }

  if (out) {
    write_json(out, "contract.json", {
      status,
      service,
      contract,
      actions,
      problems,
    });
  }
  if (problems.length > 0) {
    process.stderr.write(
      `hello ${status ?? "no response"} service ${service ? "ok" : "mismatch"} contract ${contract ? "ok" : "mismatch"} actions ${actions ? "ok" : "mismatch"}\n${problems.join("\n")}\n`
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write("hello 200 service ok contract ok actions ok\n");
};

await main();
