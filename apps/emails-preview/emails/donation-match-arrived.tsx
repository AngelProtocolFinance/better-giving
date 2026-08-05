import { donation_match_arrived } from "emails";

const { node } = donation_match_arrived.template({
  donation_id: "TXN-2025-001234",
  amount: { value: 250, currency: "USD", value_usd: 250 },
  to_name: "Save The Rainforest Foundation",
  from: {
    first_name: "Jane",
    full_name: "Jane Doe",
  },
  employer_name: "Northwind Traders",
});

export default () => node;
