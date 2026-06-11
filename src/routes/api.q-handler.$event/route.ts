import type { ActionFunction } from "react-router";
import * as banking_approved from "@/queue/msgs/banking-approved";
import * as banking_default from "@/queue/msgs/banking-default";
import * as banking_new from "@/queue/msgs/banking-new";
import * as banking_rejected from "@/queue/msgs/banking-rejected";
import * as don_dist from "@/queue/msgs/don-dist";
import * as don_sttl_dist from "@/queue/msgs/don-sttl-dist";
import * as don_sttl_receipt from "@/queue/msgs/don-sttl-receipt";
import * as fund_member_removed from "@/queue/msgs/fund-member-removed";
import * as invite_email from "@/queue/msgs/invite-email";
import * as lock_tx_created from "@/queue/msgs/lock-tx-created";
import * as reg_created from "@/queue/msgs/reg-created";
import * as reg_updated from "@/queue/msgs/reg-updated";
import * as sub_deactivated from "@/queue/msgs/sub-deactivated";
import * as tip_received from "@/queue/msgs/tip-received";
import type { IMsg } from "@/queue/types";
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

export const action: ActionFunction = async ({ request, params }) => {
  const raw = await verify_qstash(request);
  const event = params.event!;
  const payload = JSON.parse(raw);

  const msg: IMsg = { id: event, payload, dedupe: "" };

  if (reg_created.is_for(msg)) return handle(handle_reg_created, msg.payload);
  if (reg_updated.is_for(msg)) return handle(handle_reg_updated, msg.payload);
  if (invite_email.is_for(msg)) return handle(handle_invite, msg.payload);
  if (banking_new.is_for(msg))
    return handle(handle_banking_new_account, msg.payload);
  if (banking_approved.is_for(msg))
    return handle(handle_banking_approved, msg.payload);
  if (banking_rejected.is_for(msg))
    return handle(handle_banking_rejected, msg.payload);
  if (banking_default.is_for(msg))
    return handle(handle_banking_set_default, msg.payload);
  if (tip_received.is_for(msg)) return handle(handle_tip_received, msg.payload);
  if (lock_tx_created.is_for(msg))
    return handle(handle_lock_tx_created, msg.payload);
  if (don_dist.is_for(msg))
    return handle((p) => handle_don_dist(db, p), msg.payload);
  if (don_sttl_receipt.is_for(msg))
    return handle(handle_don_receipt, msg.payload);
  if (don_sttl_dist.is_for(msg))
    return handle(handle_don_sttl_dist, msg.payload);
  if (fund_member_removed.is_for(msg))
    return handle(handle_fund_member_removed, msg.payload);
  if (sub_deactivated.is_for(msg))
    return handle(handle_sub_deactivated, msg.payload);

  console.warn(`unknown queue event: ${event}`);
  return new Response("unknown event", { status: 400 });
};

async function handle<T>(fn: (payload: T) => Promise<unknown>, payload: T) {
  await fn(payload);
  return new Response("ok", { status: 200 });
}
