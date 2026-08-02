import { donation_match_refund_notif } from "emails";

const { node } = donation_match_refund_notif.template({
  to_name: "Save The Rainforest Foundation",
  donor_name: "Jane Doe",
  donor_email: "jane@example.com",
  employer_name: "Northwind Traders",
  donation: {
    id: "TXN-2025-001234",
    amount: { value: 250, currency: "USD", value_usd: 250 },
  },
  filed_at: "2025-12-17T10:00:00.000Z",
  refunded_at: "2025-12-21T14:30:00.000Z",
  void_reason: "refunded",
});

export default () => node;
