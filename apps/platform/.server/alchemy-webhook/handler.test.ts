import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  simple_price,
  simple_token_price,
} from "../kit/fixtures/coingecko-examples";

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
vi.mock("$/kit/coingecko", () => ({ coingecko: coingecko_mock }));
vi.mock("$/kit/discord", () => ({
  aws_monitor: { send_alert: send_alert_mock },
}));
vi.mock("#/errors/report", () => ({ report_error: report_error_mock }));

const keyed = await import(
  "#/routes/api.alchemy-webhook.$chain_id_.$signing_key/route"
);
const keyless = await import("#/routes/api.alchemy-webhook.$chain_id/route");

const sign = (body: string, key: string) =>
  createHmac("sha256", key).update(body, "utf8").digest("hex");

/**
 * EIP-55 form of the WBTC contract in the simple/token_price example.
 * Alchemy sends checksum-cased contracts; that example keys the address
 * in lowercase.
 */
const WBTC = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" as const;

const activity = (i = 0) => ({
  fromAddress: "0xsender",
  toAddress: DEPOSIT,
  hash: `0xhash${i}`,
  value: 2,
  asset: "WBTC",
  category: "token",
  rawContract: { address: WBTC, decimals: "8" },
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
  sig: string | null
) =>
  action({
    request: new Request(
      `https://x/api/alchemy-webhook/${Object.values(params).join("/")}`,
      {
        method: "POST",
        body,
        headers: sig === null ? {} : { "x-alchemy-signature": sig },
      }
    ),
    params,
  });

const price = () =>
  coingecko_mock.mockImplementation(async () =>
    Response.json(simple_token_price)
  );

const quiet_console = () =>
  (["info", "warn", "error"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => {})
  );

// the real deposit lookup, so each chain's deposit-address mapping is tested
beforeEach(() => {
  vi.stubEnv("CRYPTO_DEPOSIT_ADDR_EVM", DEPOSIT);
});

afterEach(() => {
  vi.unstubAllEnvs();
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
    ["missing", null],
    ["short", "abc123"],
    ["non-hex", "z".repeat(64)],
  ])("a %s signature is a 401 before any work", async (_, sig) => {
    quiet_console();
    keys["eth-mainnet"] = ETH_KEY;

    const res = await post(
      keyless.action,
      { chain_id: "eth-mainnet" },
      payload(),
      sig
    );

    expect(res.status).toBe(401);
    expect(coingecko_mock).not.toHaveBeenCalled();
    expect(send_alert_mock).not.toHaveBeenCalled();
  });

  test("an uppercase-hex signature made with the env key is accepted", async () => {
    quiet_console();
    keys["eth-mainnet"] = ETH_KEY;
    price();
    const body = payload();

    const res = await post(
      keyless.action,
      { chain_id: "eth-mainnet" },
      body,
      sign(body, ETH_KEY).toUpperCase()
    );

    expect(res.status).toBe(200);
    expect(send_alert_mock).toHaveBeenCalledOnce();
  });

  test.each([
    ["keyed", keyed.action, { signing_key: "anything" }],
    ["keyless", keyless.action, {}],
  ] as const)(
    "the %s url processes a delivery signed with the env key",
    async (_, action, extra) => {
      quiet_console();
      keys["eth-mainnet"] = ETH_KEY;
      price();
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
            { name: "USD Value", value: "153442.00", inline: true },
          ]),
        })
      );
    }
  );

  test.each([
    ["no activity", JSON.stringify({ event: { network: "ETH_MAINNET" } })],
    ["no event", JSON.stringify({ webhookId: "wh_1", type: "GRAPHQL" })],
    ["non-json", "ping"],
  ])(
    "a signed body with %s is acknowledged and does nothing",
    async (_, body) => {
      quiet_console();
      keys["eth-mainnet"] = ETH_KEY;

      const res = await post(
        keyless.action,
        { chain_id: "eth-mainnet" },
        body,
        sign(body, ETH_KEY)
      );

      expect(res.status).toBe(200);
      expect(coingecko_mock).not.toHaveBeenCalled();
      expect(send_alert_mock).not.toHaveBeenCalled();
      expect(report_error_mock).not.toHaveBeenCalled();
    }
  );

  test("a bnb delivery to the deposit address raises an alert", async () => {
    quiet_console();
    keys["bnb-mainnet"] = ETH_KEY;
    price();
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

  test("a known chain with no env key 500s every time, never trying the url key, and reports once", async () => {
    quiet_console();
    keys["eth-mainnet"] = ETH_KEY;
    const body = payload();
    const deliver = () =>
      post(
        keyed.action,
        { chain_id: "bnb-mainnet", signing_key: "url-key" },
        body,
        sign(body, "url-key")
      );

    const first = await deliver();
    const second = await deliver();

    expect([first.status, second.status]).toEqual([500, 500]);
    expect(report_error_mock).toHaveBeenCalledOnce();
    expect(report_error_mock).toHaveBeenCalledWith(
      new Error("ALCHEMY_SIGNING_KEY_BNB_MAINNET is not set"),
      { chain_id: "bnb-mainnet" }
    );
    expect(coingecko_mock).not.toHaveBeenCalled();
    expect(send_alert_mock).not.toHaveBeenCalled();
  });

  test("a delivery of more than 50 receives alerts for every one", async () => {
    quiet_console();
    keys["eth-mainnet"] = ETH_KEY;
    price();
    const body = payload(51);

    const res = await post(
      keyless.action,
      { chain_id: "eth-mainnet" },
      body,
      sign(body, ETH_KEY)
    );

    expect(res.status).toBe(200);
    expect(send_alert_mock).toHaveBeenCalledTimes(51);
    expect(send_alert_mock).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: expect.arrayContaining([{ name: "Hash", value: "0xhash50" }]),
      })
    );
    expect(report_error_mock).not.toHaveBeenCalled();
  });

  test("each asset is valued at its own published price", async () => {
    quiet_console();
    keys["eth-mainnet"] = ETH_KEY;
    // the second contract is one of the two addresses in
    // https://docs.coingecko.com/docs/portfolio-tracking ; its price object is
    // the simple/price example, the other published usd figure
    const DAI = "0x6b175474e89094c44da98b954eedeac495271d0f" as const;
    const seen: URL[] = [];
    coingecko_mock.mockImplementation(async (edit: (u: URL) => URL) => {
      const url = edit(new URL("https://cg.test"));
      seen.push(url);
      if (url.searchParams.get("contract_addresses") === DAI) {
        return Response.json({ [DAI]: simple_price.bitcoin });
      }
      return Response.json(simple_token_price);
    });
    const dai = { ...activity(2), rawContract: { address: DAI } };
    const body = JSON.stringify({
      event: {
        activity: [activity(0), activity(1), dai, { ...dai, hash: "0xhash3" }],
      },
    });

    const res = await post(
      keyless.action,
      { chain_id: "eth-mainnet" },
      body,
      sign(body, ETH_KEY)
    );

    expect(res.status).toBe(200);
    expect(send_alert_mock).toHaveBeenCalledTimes(4);
    const usd_values = send_alert_mock.mock.calls.map(
      ([a]: any) => a.fields.find((f: any) => f.name === "USD Value").value
    );
    // 2 WBTC at the token-price example's $76,721; 2 DAI at the simple-price
    // example's $76,975
    expect(usd_values).toEqual([
      "153442.00",
      "153442.00",
      "153950.00",
      "153950.00",
    ]);
    expect(seen.map((url) => url.pathname)).toEqual([
      "/api/v3/simple/token_price/ethereum",
      "/api/v3/simple/token_price/ethereum",
    ]);
    expect(seen.map((url) => url.searchParams.get("vs_currencies"))).toEqual([
      "usd",
      "usd",
    ]);
    expect(
      seen.map((url) => url.searchParams.get("contract_addresses"))
    ).toEqual([WBTC.toLowerCase(), DAI]);
  });
  test("a checksum-cased deposit address matches a lowercase receive", async () => {
    quiet_console();
    keys["eth-mainnet"] = ETH_KEY;
    vi.stubEnv("CRYPTO_DEPOSIT_ADDR_EVM", "0xDePoSiT");
    price();
    const body = JSON.stringify({
      event: { activity: [{ ...activity(), toAddress: "0xdeposit" }] },
    });

    const res = await post(
      keyless.action,
      { chain_id: "eth-mainnet" },
      body,
      sign(body, ETH_KEY)
    );

    expect(res.status).toBe(200);
    expect(send_alert_mock).toHaveBeenCalledOnce();
  });

  test.each([
    ["a non-ok response", async () => new Response(null, { status: 429 })],
    [
      "a throw",
      async () => {
        throw new TypeError("fetch failed");
      },
    ],
  ])(
    "a price lookup failing with %s still alerts, with the usd value unavailable, and reports once per asset",
    async (_, cg) => {
      quiet_console();
      keys["eth-mainnet"] = ETH_KEY;
      coingecko_mock.mockImplementation(cg);
      const body = payload(2);

      const res = await post(
        keyless.action,
        { chain_id: "eth-mainnet" },
        body,
        sign(body, ETH_KEY)
      );

      expect(res.status).toBe(200);
      expect(coingecko_mock).toHaveBeenCalledOnce();
      expect(send_alert_mock).toHaveBeenCalledTimes(2);
      for (const [alert] of send_alert_mock.mock.calls as any[]) {
        expect(alert.fields).toContainEqual({
          name: "USD Value",
          value: "unavailable",
          inline: true,
        });
      }
      expect(report_error_mock).toHaveBeenCalledOnce();
    }
  );

  test.each([
    ["a non-ok response", async () => new Response(null, { status: 502 })],
    [
      "a throw",
      async () => {
        throw new TypeError("fetch failed");
      },
    ],
  ])(
    "an alert send failing with %s finishes the batch, then 500s for redelivery",
    async (_, failing_send) => {
      quiet_console();
      keys["eth-mainnet"] = ETH_KEY;
      price();
      send_alert_mock.mockImplementationOnce(
        async () => new Response(null, { status: 204 })
      );
      send_alert_mock.mockImplementationOnce(failing_send);
      const body = payload(3);

      const res = await post(
        keyless.action,
        { chain_id: "eth-mainnet" },
        body,
        sign(body, ETH_KEY)
      );

      expect(send_alert_mock).toHaveBeenCalledTimes(3);
      expect(res.status).toBe(500);
    }
  );
});
