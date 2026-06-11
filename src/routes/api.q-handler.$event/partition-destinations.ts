import type { IDonationSettled, IParent, TToType } from "@/donations";
import { amnt_sum, partition } from "@/donations/helpers";
import type { IInput, IParts, ISource, ISttlmnt } from "@/types/donation-dist";
import { form_get } from "$/pg/queries/form";
import { nav_ltd } from "$/pg/queries/nav";
import { npos_batch_get } from "$/pg/queries/npo";
import { shared } from "$/settlement/helpers";

export const partition_destinations = async (b: IDonationSettled) => {
  const {
    id: parent_id,
    created_at: parent_created_at,
    amount: parent_amount,
    settlement: parent_settlement,
    to_id: parent_to_id,
    to_type: parent_to_type,
    to_name: parent_to_name,
    to_members: parent_to_members,
    to_tip_allowed: parent_to_tip_allowed,

    form_id,
    program,
    ...tx
  } = b;

  const prnt: IParent & { type: TToType } = {
    id: parent_id,
    to_id: parent_to_id,
    to_name: parent_to_name,
    to_members: parent_to_members,
    type: parent_to_type,
  };

  const total = amnt_sum(parent_amount);
  const total_usd = total / tx.upusd;

  // partition settlement amounts base on original partition of amount
  const parts = partition(parent_amount);
  const p_amnt = parts(total);
  /** in usd/usdc */
  const p_sttl_net = parts(parent_settlement.net);

  const sttl: ISttlmnt = {
    id: parent_settlement.id,
    date: parent_settlement.date,
    currency: parent_settlement.currency,
  };
  const ps: IParts = {
    amnt: p_amnt,
    amnt_usd: parts(total_usd),
    fa: parts(p_amnt.fee_allowance),
    sttl: p_sttl_net,
    sttl_fee: parts(parent_settlement.fee),
    sttl_fa: parts(p_sttl_net.fee_allowance),
  };

  const source_p = form_id
    ? form_get(form_id).then(
        (f): ISource => ({ id: form_id, tag: f?.tag ?? undefined })
      )
    : undefined;
  const nav_price_p = nav_ltd().then((x) => x.price);

  const [source, nav_price] = await Promise.all([source_p, nav_price_p]);

  const destinations: IInput[] = [];

  if (prnt.type === "fund") {
    const members_data = await npos_batch_get(prnt.to_members.map((m) => +m));
    const active_members = members_data
      .filter((m) => m.active !== false)
      .map((m) => m.id.toString());
    const n = active_members.length;
    if (n === 0) return { destinations };
    const member_ps = shared(ps, n);
    for (const m of active_members) {
      const i: IInput = {
        id: +m,
        ps: member_ps,
        sttl,
        prnt,
        tx,
        source,
        // donation can't be attributed to npo's program for multi npo fund
        program: undefined,
        nav_price,
      };
      destinations.push(i);
    }
  } else if (parent_to_type === "npo") {
    const i: IInput = {
      id: +parent_to_id,
      ps,
      sttl,
      prnt,
      tx,
      source,
      program,
      nav_price,
    };
    destinations.push(i);
  }

  return { destinations };
};
