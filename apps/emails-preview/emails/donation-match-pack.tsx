import { donation_match_pack } from "emails";

const { node } = donation_match_pack.template({
  id: "TXN-2025-001234",
  date: "December 17, 2025",
  amount: { value: 250, currency: "USD", value_usd: 250 },
  to_name: "Save The Rainforest Foundation",
  from: {
    first_name: "Jane",
    full_name: "Jane Doe",
    address: "123 Main St, San Francisco, CA 94105",
  },
  employer_name: "Northwind Traders",
});

export default () => node;
