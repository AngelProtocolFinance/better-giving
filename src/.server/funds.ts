import { report_error } from "@/errors/report";
import type {
  IFundItem,
  IFundItemsPage,
  IFundsNpoMemberOfSearchObj,
  IFundsSearchObj,
} from "@/fundraiser";
import { fund_npo_memberof, fund_search } from "$/pg/queries/fund";

export const get_funds = async (
  params: IFundsSearchObj
): Promise<IFundItemsPage> => {
  try {
    return await fund_search(params);
  } catch (err) {
    report_error(err);
    return { items: [], page: 1, pages: 1 };
  }
};

export const get_funds_npo_memberof = async (
  endow_id: number,
  params: IFundsNpoMemberOfSearchObj
): Promise<IFundItem[]> => {
  try {
    return await fund_npo_memberof(endow_id, params);
  } catch (err) {
    report_error(err, { endow_id });
    return [];
  }
};
