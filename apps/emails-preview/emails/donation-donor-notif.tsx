import { donation_donor_notif } from "emails";

const { node } = donation_donor_notif.template({
  donor_first_name: "Jane",
  transaction_id: "TXN-2025-001234",
  nonprofit_name: "Save The Rainforest Foundation",
  program_name: "Amazon Conservation",
  is_guest: true,
  is_recurring: false,
});

export default () => node;
