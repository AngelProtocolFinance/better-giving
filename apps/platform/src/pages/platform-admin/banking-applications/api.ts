import { valibotResolver } from "@hookform/resolvers/valibot";
import type { ActionFunction, LoaderFunctionArgs } from "react-router";
import { getValidatedFormData } from "remix-hook-form";
import * as v from "valibot";
import { safeParse } from "valibot";
import { redirectWithSuccess } from "#/.server/toast";
import type { IBapp, IUpdate } from "@/banking";
import { update } from "@/banking/schema";
import { resp } from "@/helpers/https";
import { msg } from "@/queue";
import { $int_gte1 } from "@/schemas";
import type { V2RecipientAccount } from "@/wise";
import { enqueue } from "$/kit/queue";
import { wise } from "$/kit/wise";
import {
  bapp_get,
  bapp_update_status,
  npo_bapp_count,
} from "$/pg/queries/banking";

export interface LoaderData extends V2RecipientAccount {
  ba: IBapp;
}

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const p = safeParse($int_gte1, params.id);
  if (p.issues) throw resp.status(400, p.issues[0].message);
  const bank_id = p.output;

  const x = await bapp_get(bank_id.toString());
  if (!x) throw resp.status(404);

  const y = await wise.v2_account(bank_id);
  return { ba: x, ...y } satisfies LoaderData;
};

export const action: ActionFunction = async ({ params, request }) => {
  const fv = await getValidatedFormData<IUpdate>(
    request,
    valibotResolver(update)
  );
  if (fv.errors) return fv;

  const p_id = v.safeParse($int_gte1, params.id);
  if (p_id.issues) return resp.status(400, p_id.issues[0].message);
  const bank_id = p_id.output;

  const x = await bapp_get(bank_id.toString());
  if (!x) return { status: 404, statusText: `Bank:${bank_id} not found` };

  if (fv.data.type === "approved") {
    // auto-default if npo has no other banking apps
    const count = await npo_bapp_count(x.npo_id);
    const new_status = count <= 1 ? "default" : "approved";
    const prev = await bapp_update_status(bank_id.toString(), {
      status: new_status,
    });
    if (prev?.status === "under-review") {
      await enqueue(msg("banking-approved", { npo_id: x.npo_id }));
    }
  } else {
    const prev = await bapp_update_status(bank_id.toString(), {
      status: fv.data.type,
      rejection_reason: fv.data.reason,
    });
    if (prev?.status === "under-review") {
      await enqueue(msg("banking-rejected", { npo_id: x.npo_id }));
    }
  }
  return redirectWithSuccess("../success", "Application updated");
};
