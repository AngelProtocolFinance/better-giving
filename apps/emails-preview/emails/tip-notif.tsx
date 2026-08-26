import { tip_notif } from "emails";

const { node } = tip_notif.template({
  id: "don-preview-001",
  date: "26 Aug 2026, 14:05 UTC",
  amount: { value: 100, currency: "USD", value_usd: 100 },
  to_name: "Save The Rainforest Foundation",
  to_id: "1234",
});

export default () => node;
