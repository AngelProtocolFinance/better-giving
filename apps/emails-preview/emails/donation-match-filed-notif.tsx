import { donation_match_filed_notif } from "emails";

const { node } = donation_match_filed_notif.template({
  id: "TXN-2025-001234",
  date: "December 17, 2025",
  amount: { value: 250, currency: "USD", value_usd: 250 },
  to_name: "Save The Rainforest Foundation",
  from: {
    first_name: "Jane",
    full_name: "Jane Doe",
  },
  from_email: "jane@example.com",
  employer_name: "Northwind Traders",
});

export default () => node;
