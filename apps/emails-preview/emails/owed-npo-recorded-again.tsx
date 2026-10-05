import { owed_npo_notif } from "emails";

// credited back in full, then owing again after a later dispute's fee
const { node } = owed_npo_notif.template({
  kind: "recorded",
  round: 1,
  to_name: "Save The Rainforest Foundation",
  history_url: "https://better.giving/admin/4021/dashboard/grants",
  gift: {
    id: "TXN-2026-004512",
    date: "Nov 5, 2026",
    amount: { value: 100, currency: "USD" },
  },
  source: "refund",
  recorded_at: "Nov 20, 2026",
  received_usd: 90,
  fee_processing_usd: 3.2,
  fee_dispute_usd: 15,
  refund_failed_usd: 0,
  credited_back_usd: 93.2,
  credited_back_at: "Nov 22, 2026",
  recovered_usd: 0,
  written_off_usd: 0,
  outstanding_usd: 15,
});

export default () => node;
