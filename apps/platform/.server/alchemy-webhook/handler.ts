import crypto from "node:crypto";
import type { ActionFunctionArgs } from "react-router";
import { report_error } from "#/errors/report";
import type { Alert } from "@/discord";
import { deposit_addr } from "../deposit-addr";
import { alchemy_signing_key } from "../env";
import { coingecko } from "../kit/coingecko";
import { aws_monitor } from "../kit/discord";
import {
  ALCHEMY_CHAINS,
  type IActivity,
  type IPayload,
  type IPriceByKey,
  type TAlchemyChainId,
} from "./types";

const SHA256_HEX = /^[0-9a-f]{64}$/i;

const is_chain_id = (x: string): x is TAlchemyChainId =>
  Object.hasOwn(ALCHEMY_CHAINS, x);

function is_signed(body: string, sig: string | null, key: string): boolean {
  // timingSafeEqual throws on unequal lengths, so only a digest-shaped
  // signature is compared
  if (!sig || !SHA256_HEX.test(sig)) return false;
  const digest = crypto.createHmac("sha256", key).update(body, "utf8").digest();
  return crypto.timingSafeEqual(digest, Buffer.from(sig, "hex"));
}

// the request reaching here is unauthenticated, so a report per request
// would let anyone flood the error tracker
const reported_unconfigured = new Set<TAlchemyChainId>();
function report_unconfigured(chain_id: TAlchemyChainId) {
  const env = ALCHEMY_CHAINS[chain_id].signing_key_env;
  if (reported_unconfigured.has(chain_id)) {
    console.error(`alchemy webhook: ${env} is not set`);
    return;
  }
  reported_unconfigured.add(chain_id);
  report_error(new Error(`${env} is not set`), { chain_id });
}

// a batch repeats an asset across activities, so each contract's price is
// fetched once per request; a failed fetch resolves null and is not retried
function usd_rate_lookup(chain_id: TAlchemyChainId) {
  const platform = ALCHEMY_CHAINS[chain_id].cg_platform;
  const rates = new Map<string, Promise<number | null>>();
  const fetch_rate = async (contract: string): Promise<number | null> => {
    try {
      const cg_res = await coingecko((x) => {
        x.pathname = `api/v3/simple/token_price/${platform}?contract_addresses=${contract}&vs_currencies=usd`;
        return x;
      });
      if (!cg_res.ok) throw new Error(`cg fetch failed: ${cg_res.statusText}`);
      const data: IPriceByKey = await cg_res.json();
      return data?.[contract]?.usd ?? 0;
    } catch (err) {
      report_error(err, { chain_id, contract });
      return null;
    }
  };
  return (contract: string) => {
    let rate = rates.get(contract);
    if (!rate) {
      rate = fetch_rate(contract);
      rates.set(contract, rate);
    }
    return rate;
  };
}

// other webhook types and the dashboard's test delivery reach this url too
function activities_of(body: string): IActivity[] | null {
  try {
    const p: Partial<IPayload> | null = JSON.parse(body);
    return Array.isArray(p?.event?.activity) ? p.event.activity : null;
  } catch {
    return null;
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  const chain_id = params.chain_id ?? "";
  if (!is_chain_id(chain_id)) {
    return new Response("unknown chain", { status: 404 });
  }

  // 5xx so alchemy redelivers once the key is set
  const signing_key = alchemy_signing_key[chain_id];
  if (!signing_key) {
    report_unconfigured(chain_id);
    return new Response("webhook not configured", { status: 500 });
  }

  const body = await request.text();
  // warn, not report_error: anyone can send a forgery
  if (
    !is_signed(body, request.headers.get("x-alchemy-signature"), signing_key)
  ) {
    console.warn(`alchemy webhook: invalid signature for ${chain_id}`);
    return new Response("invalid signature", { status: 401 });
  }

  console.info(body);
  // 200, not 5xx: a redelivery of a signed body carries the same shape
  const activities = activities_of(body);
  if (!activities) {
    console.warn(`alchemy webhook: no activity to process for ${chain_id}`);
    return new Response("ok", { status: 200 });
  }

  const chain = ALCHEMY_CHAINS[chain_id];
  const usd_rate_of = usd_rate_lookup(chain_id);
  // evm addresses arrive checksum-cased (EIP-55) or lowercase
  const deposit = deposit_addr(chain.deposit_chain).toLowerCase();
  let alerts_failed = 0;
  for (const activity of activities) {
    // we are only interested in receives
    if (activity.toAddress?.toLowerCase() !== deposit) {
      console.warn(`not a receive transaction, to: ${activity.toAddress}`);
      continue;
    }
    const contract = activity.rawContract.address?.toLowerCase();
    if (!contract) {
      console.warn("not a token transfer, skipping");
      continue;
    }

    const usd_rate = await usd_rate_of(contract);
    const usd_value =
      usd_rate === null
        ? "unavailable"
        : (activity.value * usd_rate).toFixed(2);
    const alert: Alert = {
      from: "alchemy-webhook",
      type: "NOTICE",
      title: `New ${chain_id} donation`,
      fields: [
        { name: "Asset", value: activity.asset, inline: true },
        { name: "Chain", value: chain_id, inline: true },
        { name: "From", value: activity.fromAddress },
        { name: "Amount", value: activity.value.toString(), inline: true },
        { name: "USD Value", value: usd_value, inline: true },
        { name: "Hash", value: activity.hash },
      ],
    };
    console.info(JSON.stringify(alert, null, 2));

    try {
      const res = await aws_monitor.send_alert(alert);
      console.info("discord notif", res.status, res.statusText);
      if (!res.ok) alerts_failed++;
    } catch (err) {
      console.error("discord notif failed", err);
      alerts_failed++;
    }
  }

  if (alerts_failed > 0) {
    // no idempotency store: redelivery repeats sent alerts — a duplicate alert beats a missed one
    return new Response("alert delivery failed", { status: 500 });
  }
  return new Response("ok", { status: 200 });
}
