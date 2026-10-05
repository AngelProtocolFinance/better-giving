import { owed_npo_notif } from "emails";

// won after a grant had already recovered $40 of it: that $40 is due back
const { node } = owed_npo_notif.template({
  kind: "credited",
  to_name: "Save The Rainforest Foundation",
  history_url: "https://better.giving/admin/4021/dashboard/grants",
  gift: {
    id: "TXN-2026-004512",
    date: "Nov 5, 2026",
    amount: { value: 100, currency: "USD" },
  },
  source: "dispute",
  recorded_at: "Nov 20, 2026",
  received_usd: 90,
  fee_processing_usd: 3.2,
  fee_dispute_usd: 0,
  credited_back_usd: 93.2,
  credited_back_at: "Dec 2, 2026",
  recovered_usd: 40,
  written_off_usd: 0,
  outstanding_usd: -40,
});

export default () => node;
