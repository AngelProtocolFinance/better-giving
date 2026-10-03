import crypto from "node:crypto";
import { report_error } from "#/errors/report";
import type { Alert } from "@/discord";
import { deposit_addr } from "$/deposit-addr";
import { alchemy_signing_key } from "$/env";
import { coingecko } from "$/kit/coingecko";
import { aws_monitor } from "$/kit/discord";
import type { Route } from "./+types/route";
import type { IPayload, IPriceByKey, TAlchemyChainId } from "./types";

// each processed activity costs a coingecko call and a discord post
const MAX_ACTIVITIES = 50;
const SHA256_HEX = /^[0-9a-f]{64}$/;

const cg_platform_ids: { [key in TAlchemyChainId]: string } = {
  "eth-mainnet": "ethereum",
  "bnb-mainnet": "binance-smart-chain",
};

const chain_env_key: { [key in TAlchemyChainId]: string } = {
  "eth-mainnet": "eth",
  "bnb-mainnet": "bnb",
};

const is_chain_id = (x: string): x is TAlchemyChainId =>
  Object.hasOwn(cg_platform_ids, x);

function is_signed(body: string, sig: string | null, key: string): boolean {
  // timingSafeEqual throws on unequal lengths, so only a digest-shaped
  // signature is compared
  if (!sig || !SHA256_HEX.test(sig)) return false;
  const digest = crypto.createHmac("sha256", key).update(body, "utf8").digest();
  return crypto.timingSafeEqual(digest, Buffer.from(sig, "hex"));
}

export async function action({ request, params }: Route.ActionArgs) {
  const chain_id = params.chain_id;
  if (!is_chain_id(chain_id)) {
    return new Response("unknown chain", { status: 404 });
  }

  // 5xx so alchemy redelivers once the key is set
  const signing_key = alchemy_signing_key[chain_id];
  if (!signing_key) {
    report_error(new Error(`alchemy signing key not set for ${chain_id}`), {
      chain_id,
    });
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

  const p: IPayload = JSON.parse(body);
  console.info(JSON.stringify(p, null, 2));

  const activities = p.event.activity;
  if (activities.length > MAX_ACTIVITIES) {
    report_error(
      new Error(
        `alchemy webhook: ${activities.length} activities, processing first ${MAX_ACTIVITIES}`
      ),
      { chain_id }
    );
  }

  for (const activity of activities.slice(0, MAX_ACTIVITIES)) {
    // we are only interested in receives
    const to = deposit_addr(chain_env_key[chain_id]);
    if (activity.toAddress !== to) {
      console.warn(`not a receive transaction, to: ${activity.toAddress}`);
      continue;
    }
    const contract = activity.rawContract.address?.toLowerCase();
    if (!contract) {
      console.warn("not a token transfer, skipping");
      continue;
    }

    // fetch usd_rate
    const platform = cg_platform_ids[chain_id];
    const cg_res = await coingecko((x) => {
      x.pathname = `api/v3/simple/token_price/${platform}?contract_addresses=${contract}&vs_currencies=usd`;
      return x;
    });

    if (!cg_res.ok) {
      report_error(new Error(`cg fetch failed: ${cg_res.statusText}`), {
        chain_id,
        contract,
      });
      continue;
    }

    const data: IPriceByKey = await cg_res.json();
    const usd_rate = data?.[contract]?.usd ?? 0;

    const usd_value = activity.value * usd_rate;
    const alert: Alert = {
      from: "alchemy-webhook",
      type: "NOTICE",
      title: `New ${chain_id} donation`,
      fields: [
        { name: "Asset", value: activity.asset, inline: true },
        { name: "Chain", value: chain_id, inline: true },
        { name: "From", value: activity.fromAddress },
        { name: "Amount", value: activity.value.toString(), inline: true },
        { name: "USD Value", value: usd_value.toFixed(2), inline: true },
        { name: "Hash", value: activity.hash },
      ],
    };
    console.info(JSON.stringify(alert, null, 2));

    const res = await aws_monitor.send_alert(alert);
    console.info("discord notif", res.status, res.statusText);
  }

  return new Response("ok", { status: 200 });
}
