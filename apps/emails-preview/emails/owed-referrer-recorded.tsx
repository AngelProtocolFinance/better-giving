import { owed_referrer_notif } from "emails";

const { node } = owed_referrer_notif.template({
  kind: "recorded",
  to_name: "Jane",
  history_url: "https://better.giving/dashboard/referrals/payouts",
  gift: {
    id: "TXN-2026-004512",
    date: "Nov 5, 2026",
    amount: { value: 100, currency: "USD" },
  },
  source: "refund",
  recorded_at: "Nov 20, 2026",
  received_usd: 4.5,
  fee_processing_usd: 0,
  fee_dispute_usd: 0,
  credited_back_usd: 0,
  recovered_usd: 0,
  written_off_usd: 0,
  outstanding_usd: 4.5,
});

export default () => node;
