import type { IDonationUpdate } from "@/donations";
import { to_full_or_anonymous } from "@/helpers/name";
import { paypal } from "$/kit/paypal";
import { db } from "$/pg/db";
import { donation_update } from "$/pg/queries/donation";

interface ICaptureInput {
  order_id: string;
  don_id: string;
}

export const capture_order = async ({ order_id, don_id }: ICaptureInput) => {
  // order_id is stable per intent — use it as the idempotency key so a retry
  // after a timeout returns the original capture instead of duplicating it
  const capture = await paypal.capture_order(order_id, `capture-${order_id}`);

  const ps = capture.payment_source?.paypal || capture.payment_source?.venmo;
  if (ps?.email_address) {
    const update: IDonationUpdate = {};
    const name = ps.name;
    const addr = ps.address;

    update.from_email = ps.email_address;

    // guard the raw parts — to_full_or_anonymous defaults to "Anonymous",
    // which would clobber the form-entered name recorded at intent time
    if (name?.given_name || name?.surname)
      update.from_name = to_full_or_anonymous(name.given_name, name.surname);

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
