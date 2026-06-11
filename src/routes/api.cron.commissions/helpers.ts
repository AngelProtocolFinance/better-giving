import { npo_default_bapp } from "$/pg/queries/banking";
import { npo_by_rid } from "$/pg/queries/npo";
import { user_by_referral_code } from "$/pg/queries/user";

interface Referrer {
  pay_id?: number;
  /** default $50 */
  pay_min: number;
  id: string;
  name: string;
  email: string;
}

export async function get_referrer(
  referral_id: string
): Promise<Referrer | null> {
  //handle nonprofit referrer
  if (referral_id.startsWith("NPO-")) {
    const item = await npo_by_rid(referral_id);
    if (!item) return null;

    //get default payout method
    const wise_id = await npo_default_bapp(item.id).then((x) => x?.id);
    if (!wise_id) return null;

    return {
      id: referral_id,
      name: item.name,
      email: "n/a",
      pay_id: +wise_id,
      pay_min: 50,
    };
  }

  const user = await user_by_referral_code(referral_id);
  if (!user) return null;

  return {
    name: `${user.first_name} ${user.last_name}`,
    email: user.email,
    pay_id: user.pay_id ? +user.pay_id : undefined,
    pay_min: user.pay_min,
    id: user.referral_code,
  };
}
