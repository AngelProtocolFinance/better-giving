import { donation_receipt } from "emails";

const { node } = donation_receipt.template({
  id: "TXN-2025-001234",
  date: "December 17, 2025",
  amount: { value: 103.2, currency: "USD", value_usd: 103.2 },
  to_name: "Save The Rainforest Foundation",
  from: {
    first_name: "Jane",
    full_name: "Jane Doe",
    address: "123 Main St, San Francisco, CA 94105",
  },
  tax_receipt_id: "TR-2025-001234",
  is_recurring: false,
  is_bg: false,
  lines: [
    {
      kind: "beneficiary",
      name: "Save The Rainforest Foundation",
      amount: { value: 100, currency: "USD", value_usd: 100 },
      program: "Amazon Conservation",
      msg: "Every dollar you give protects another acre of the Amazon. Thank you for standing with us.",
    },
    {
      kind: "fee",
      name: "Better Giving",
      amount: { value: 3.2, currency: "USD", value_usd: 3.2 },
    },
  ],
});

export default () => node;
