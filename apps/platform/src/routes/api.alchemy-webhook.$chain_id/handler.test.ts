import { createHmac } from "node:crypto";
import { afterEach, describe, expect, test, vi } from "vitest";

const DEPOSIT = "0xdeposit";
const ETH_KEY = "whsec_eth_env";

const keys = vi.hoisted(() => ({
  "eth-mainnet": undefined as string | undefined,
  "bnb-mainnet": undefined as string | undefined,
}));
const send_alert_mock = vi.hoisted(() =>
  vi.fn(async () => new Response(null, { status: 204 }))
);
const coingecko_mock = vi.hoisted(() => vi.fn());
const report_error_mock = vi.hoisted(() => vi.fn());

vi.mock("$/env", () => ({ alchemy_signing_key: keys }));
// the real lookup: a chain name it doesn't know never matches a receive
process.env.CRYPTO_DEPOSIT_ADDR_EVM = DEPOSIT;
vi.mock("$/kit/coingecko", () => ({ coingecko: coingecko_mock }));
vi.mock("$/kit/discord", () => ({
  aws_monitor: { send_alert: send_alert_mock },
}));
vi.mock("#/errors/report", () => ({ report_error: report_error_mock }));

const keyed = await import(
  "../api.alchemy-webhook.$chain_id.$signing_key/route"
);
const keyless = await import("./route");

const sign = (body: string, key: string) =>
  createHmac("sha256", key).update(body, "utf8").digest("hex");

const activity = (i = 0) => ({
  fromAddress: "0xsender",
  toAddress: DEPOSIT,
  hash: `0xhash${i}`,
  value: 2,
  asset: "USDC",
  category: "token",
  rawContract: { address: "0xUSDC", decimals: "6" },
});

const payload = (n = 1) =>
  JSON.stringify({
    event: {
      network: "ETH_MAINNET",
      activity: Array.from({ length: n }, (_, i) => activity(i)),
    },
  });

type Action = (args: any) => Promise<Response>;

const post = (
  action: Action,
  params: Record<string, string>,
  body: string,
  sig: string
) =>
  action({
    request: new Request(
      `https://x/api/alchemy-webhook/${Object.values(params).join("/")}`,
      { method: "POST", body, headers: { "x-alchemy-signature": sig } }
    ),
    params,
  });

const price = (usd: number) =>
  coingecko_mock.mockImplementation(async () =>
    Response.json({ "0xusdc": { usd } })
  );

const quiet_console = () =>
  (["info", "warn", "error"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => {})
  );

afterEach(() => {
  vi.restoreAllMocks();
  keys["eth-mainnet"] = undefined;
  keys["bnb-mainnet"] = undefined;
  send_alert_mock.mockClear();
  coingecko_mock.mockReset();
  report_error_mock.mockReset();
});

describe("alchemy webhook", () => {
  test("a signature made with the url's key, not the env key, is refused", async () => {
    quiet_console();
    keys["eth-mainnet"] = ETH_KEY;
    const body = payload();

    const res = await post(
      keyed.action,
      { chain_id: "eth-mainnet", signing_key: "attacker-key" },
      body,
      sign(body, "attacker-key")
    );

    expect(res.status).toBe(401);
    expect(coingecko_mock).not.toHaveBeenCalled();
    expect(send_alert_mock).not.toHaveBeenCalled();
  });

  test.each([
    ["keyed", keyed.action, { signing_key: "anything" }],
    ["keyless", keyless.action, {}],
  ] as const)(
    "the %s url processes a delivery signed with the env key",
    async (_, action, extra) => {
      quiet_console();
      keys["eth-mainnet"] = ETH_KEY;
      price(1.5);
      const body = payload();

      const res = await post(
        action,
        { chain_id: "eth-mainnet", ...extra },
        body,
        sign(body, ETH_KEY)
      );

      expect(res.status).toBe(200);
      expect(coingecko_mock).toHaveBeenCalledOnce();
      expect(send_alert_mock).toHaveBeenCalledOnce();
      expect(send_alert_mock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "New eth-mainnet donation",
          fields: expect.arrayContaining([
            { name: "USD Value", value: "3.00", inline: true },
          ]),
        })
      );
    }
  );

  test("a bnb delivery to the deposit address raises an alert", async () => {
    quiet_console();
    keys["bnb-mainnet"] = ETH_KEY;
    price(1.5);
    const body = payload();

    const res = await post(
      keyless.action,
      { chain_id: "bnb-mainnet" },
      body,
      sign(body, ETH_KEY)
    );

    expect(res.status).toBe(200);
    expect(send_alert_mock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "New bnb-mainnet donation" })
    );
  });

  test.each(["sol-mainnet", "__proto__"])(
    "an unknown chain %s is a 404 before any work",
    async (chain_id) => {
      keys["eth-mainnet"] = ETH_KEY;
      const body = payload();

      const res = await post(
        keyless.action,
        { chain_id },
        body,
        sign(body, ETH_KEY)
      );

      expect(res.status).toBe(404);
      expect(report_error_mock).not.toHaveBeenCalled();
      expect(coingecko_mock).not.toHaveBeenCalled();
      expect(send_alert_mock).not.toHaveBeenCalled();
    }
  );

  test("a known chain with no env key is a reported 500, never the url key", async () => {
    keys["eth-mainnet"] = ETH_KEY;
    const body = payload();

    const res = await post(
      keyed.action,
      { chain_id: "bnb-mainnet", signing_key: "url-key" },
      body,
      sign(body, "url-key")
    );

    expect(res.status).toBe(500);
    expect(report_error_mock).toHaveBeenCalledOnce();
    expect(report_error_mock).toHaveBeenCalledWith(expect.any(Error), {
      chain_id: "bnb-mainnet",
    });
    expect(coingecko_mock).not.toHaveBeenCalled();
    expect(send_alert_mock).not.toHaveBeenCalled();
  });

  test("a delivery over the cap processes the first 50 and reports once", async () => {
    quiet_console();
    keys["eth-mainnet"] = ETH_KEY;
    price(1);
    const body = payload(51);

    const res = await post(
      keyless.action,
      { chain_id: "eth-mainnet" },
      body,
      sign(body, ETH_KEY)
    );

    expect(res.status).toBe(200);
    expect(coingecko_mock).toHaveBeenCalledTimes(50);
    expect(send_alert_mock).toHaveBeenCalledTimes(50);
    expect(send_alert_mock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        fields: expect.arrayContaining([{ name: "Hash", value: "0xhash50" }]),
      })
    );
    expect(report_error_mock).toHaveBeenCalledOnce();
  });
});
