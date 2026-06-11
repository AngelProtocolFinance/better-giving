import { safeParse } from "valibot";
import { resp } from "@/helpers/https";
import type { IReg } from "@/reg";
import { reg_id } from "@/reg/schema";
import type { V2RecipientAccount } from "@/wise";
import { wise } from "$/kit/wise";
import { reg_get } from "$/pg/queries/registration";
import type { Route } from "./+types/route";

export interface LoaderData {
  reg: IReg;
  wacc: V2RecipientAccount | null;
}

export const loader = async ({ params }: Route.LoaderArgs) => {
  const p = safeParse(reg_id, params.id);
  if (p.issues) throw resp.status(400, p.issues[0].message);
  const id = p.output;

  const reg = await reg_get(id);
  if (!reg) throw new Response("Registration not found", { status: 404 });

  const wacc = reg.o_bank_id ? await wise.v2_account(+reg.o_bank_id) : null;

  return {
    reg,
    wacc,
  } satisfies LoaderData;
};
