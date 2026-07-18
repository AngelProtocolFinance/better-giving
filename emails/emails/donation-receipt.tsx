import { template } from "../src/templates/donation-receipt";

const { node } = template({
  id: "TXN-2025-001234",
  date: "December 17, 2025",
  amount: { value: 100, currency: "USD", value_usd: 100 },
  to_name: "Save The Rainforest Foundation",
  program_name: "Amazon Conservation",
  from: {
    first_name: "Jane",
    full_name: "Jane Doe",
    address: "123 Main St, San Francisco, CA 94105",
  },
  tax_receipt_id: "TR-2025-001234",
  is_recurring: false,
  is_bg: false,
});

export default () => node;
