import type { ActionFunction } from "react-router";
import type { Handlers, Kind } from "@/queue";
import { verify_qstash } from "$/kit/queue";
import { db } from "$/pg/db";
import { handle_lock_tx_created } from "./handle-bal-tx";
import {
  handle_banking_approved,
  handle_banking_new_account,
  handle_banking_rejected,
  handle_banking_set_default,
} from "./handle-banking";
import { handle_don_dist } from "./handle-don-dist";
import { handle_don_receipt } from "./handle-don-receipt";
import { handle_don_sttl_dist } from "./handle-don-sttl-dist";
import { handle_fund_member_removed } from "./handle-fund";
import { handle_invite } from "./handle-invite";
import { handle_reg_created, handle_reg_updated } from "./handle-reg";
import { handle_tip_received } from "./handle-rev-log";
import { handle_sub_deactivated } from "./handle-subscription";

const handlers: Handlers = {
  "banking-approved": handle_banking_approved,
  "banking-default": handle_banking_set_default,
  "banking-new": handle_banking_new_account,
  "banking-rejected": handle_banking_rejected,
  "don-dist": (p) => handle_don_dist(db, p),
  "don-sttl-dist": handle_don_sttl_dist,
  "don-sttl-receipt": handle_don_receipt,
  "fund-member-removed": handle_fund_member_removed,
  "invite-email": handle_invite,
  "lock-tx-created": handle_lock_tx_created,
  "reg-created": handle_reg_created,
  "reg-updated": handle_reg_updated,
  "sub-deactivated": handle_sub_deactivated,
  "tip-received": handle_tip_received,
};

export const action: ActionFunction = async ({ request, params }) => {
  const raw = await verify_qstash(request);
  const event = params.event as Kind;
  const handler = handlers[event];
  if (!handler) {
    console.warn(`unknown queue event: ${event}`);
    return new Response("unknown event", { status: 400 });
  }
  // handler is narrowed by `event` at runtime; the Handlers literal guarantees
  // payload shape per kind, but the dynamic lookup erases the relation for tsc.
  const payload = JSON.parse(raw);
  await (handler as (p: unknown) => Promise<unknown>)(payload);
  return new Response("ok", { status: 200 });
};
