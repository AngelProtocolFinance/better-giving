import { donation_receipt, type IDonor } from "emails";
import type { IDonation } from "@/donations";
import { send_email_or_throw } from "$/email";
import { build_receipt } from "$/receipt";

export const send_receipt = async (d: IDonation, final: boolean) => {
  const donor: IDonor = {
    first_name: d.from_name?.split(" ")[0] ?? "Donor",
    full_name: d.from_name ?? "Valued Donor",
    address: [
      d.from_addr_street,
      d.from_addr_city,
      d.from_addr_state,
      d.from_addr_zip_code,
      d.from_addr_country,
    ]
      .filter(Boolean)
      .join(", "),
  };
  const x = await build_receipt(d, donor, final);

  const { node, subject } = donation_receipt.template(x);
  const res = await send_email_or_throw({ node, subject, to: [d.from_email] });
  console.info("sent receipt:", res.id, x);
};
