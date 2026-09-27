import { donation_receipt } from "emails";

const usd = (value: number) => ({ value, currency: "USD", value_usd: value });

const { node } = donation_receipt.template({
  id: "TXN-2025-004871",
  date: "December 17, 2025",
  amount: usd(170.12),
  to_name: "Clean Water for East Africa Fund",
  is_fund: true,
  from: {
    first_name: "Jane",
    full_name: "Jane Doe",
    address: "123 Main St, San Francisco, CA 94105",
  },
  tax_receipt_id: "TR-2025-004871",
  is_recurring: true,
  lines: [
    {
      kind: "beneficiary",
      name: "Clean Water for East Africa Fund",
      amount: usd(150),
    },
    { kind: "tip", name: "Better Giving", amount: usd(15) },
    { kind: "fee", name: "Better Giving", amount: usd(5.12) },
  ],
});

export default () => node;
