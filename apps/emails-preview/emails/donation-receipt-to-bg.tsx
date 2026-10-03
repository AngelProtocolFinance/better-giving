import { donation_receipt } from "emails";

const usd = (value: number) => ({ value, currency: "USD", value_usd: value });

const { node } = donation_receipt.template({
  base_url: "https://better.giving",
  id: "TXN-2025-005102",
  date: "December 17, 2025",
  amount: usd(110),
  to_name: "Better Giving",
  from: {
    first_name: "Jane",
    full_name: "Jane Doe",
  },
  tax_receipt_id: "TR-2025-005102",
  is_bg: true,
  lines: [
    { kind: "beneficiary", name: "Better Giving", amount: usd(100) },
    { kind: "tip", name: "Better Giving", amount: usd(10) },
  ],
});

export default () => node;
