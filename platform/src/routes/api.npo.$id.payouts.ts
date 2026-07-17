import type { LoaderFunction } from "react-router";
import { admin_checks, is_resp } from "#/.server/utils";
import { resp } from "@/helpers/https";
import { npo_payouts } from "$/pg/queries/payout";

export const loader: LoaderFunction = async (x) => {
  const adm = await admin_checks(x);
  if (is_resp(adm)) return adm;
  const page = await npo_payouts(adm.id, {});
  return resp.json(page);
};
