import type { IDonationUpdate } from "@/donations";
import { to_full } from "@/helpers/name";
import { paypal } from "$/kit/paypal";
import { db } from "$/pg/db";
import { donation_update } from "$/pg/queries/donation";

interface ICaptureInput {
  order_id: string;
  don_id: string;
}

export const capture_order = async ({ order_id, don_id }: ICaptureInput) => {
  const capture = await paypal.capture_order(order_id);

  const ps = capture.payment_source?.paypal || capture.payment_source?.venmo;
  if (ps?.email_address) {
    const update: IDonationUpdate = {};
    const name = ps.name;
    const addr = ps.address;

    update.from_email = ps.email_address;

    const fn = to_full(name?.given_name, name?.surname);
    if (fn) update.from_name = fn;

    const street = [addr?.address_line_1, addr?.address_line_2]
      .filter(Boolean)
      .join(" ");
    if (street) update.from_addr_street = street;
    if (addr?.admin_area_2) update.from_addr_city = addr.admin_area_2;
    if (addr?.admin_area_1) update.from_addr_state = addr.admin_area_1;
    if (addr?.postal_code) update.from_addr_zip_code = addr.postal_code;
    if (addr?.country_code) update.from_addr_country = addr.country_code;

    await donation_update(db, don_id, update);
  }

  return capture;
};
