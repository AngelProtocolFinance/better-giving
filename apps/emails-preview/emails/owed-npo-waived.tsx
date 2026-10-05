import { owed_npo_notif } from "emails";

const { node } = owed_npo_notif.template({
  kind: "waived",
  to_name: "Save The Rainforest Foundation",
  history_url: "https://better.giving/admin/4021/dashboard/grants",
  gift: {
    id: "TXN-2026-004512",
    date: "Nov 5, 2026",
    amount: { value: 120, currency: "EUR" },
  },
  source: "refund",
  recorded_at: "Nov 20, 2026",
  received_usd: 90,
  fee_processing_usd: 3.2,
  fee_dispute_usd: 0,
  credited_back_usd: 0,
  recovered_usd: 40,
  written_off_usd: 53.2,
  written_off_at: "Dec 9, 2026",
  outstanding_usd: 0,
});

export default () => node;
