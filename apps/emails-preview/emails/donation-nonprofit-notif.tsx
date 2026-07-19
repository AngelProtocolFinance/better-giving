import { donation_nonprofit_notif } from "emails";

const { node } = donation_nonprofit_notif.template({
  id: "TXN-2025-001234",
  date: "December 17, 2025",
  amount: { value: 250, currency: "PHP", value_usd: 4.5 },
  to_id: "12345",
  to_name: "Save The Rainforest Foundation",
  claimed: true,
  from: {
    first_name: "John",
    full_name: "John Smith",
    address: "456 Oak Ave, New York, NY 10001",
  },
  program_name: "Amazon Conservation",
  is_recurring: false,
  from_private_msg_to_to:
    "Thank you for all the amazing work you do for the rainforest. Keep it up!",
});

export default () => node;
