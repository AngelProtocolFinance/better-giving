import { template } from "../src/templates/donation-donor-notif";

const { node } = template({
  donor_first_name: "Jane",
  transaction_id: "TXN-2025-001234",
  nonprofit_name: "Save The Rainforest Foundation",
  program_name: "Amazon Conservation",
  is_guest: true,
  is_recurring: false,
});

export default () => node;
