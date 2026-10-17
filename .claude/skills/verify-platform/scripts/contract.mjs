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
  "Checks keyless GET /connector/v1/hello against CONNECTOR_ORIGIN. Does not run the browser Allow flow.";

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

  let status = null;
  let service = false;
  let contract = false;
  let failure = "";
  try {
    const res = await fetch(`${origin}/connector/v1/hello`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    status = res.status;
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    service = body?.service === "better-giving";
    contract = body?.contract === 1;
  } catch (err) {
    failure = err.cause?.code ?? err.name ?? "fetch failed";
  }

  if (out) {
    write_json(out, "contract.json", { status, service, contract });
  }
  if (status !== 200 || !service || !contract) {
    const detail = failure ? ` (${failure})` : "";
    process.stderr.write(
      `hello ${status ?? "no response"}${detail} service ${service ? "ok" : "mismatch"} contract ${contract ? "ok" : "mismatch"}\n`
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write("hello 200 service ok contract ok\n");
};

await main();
