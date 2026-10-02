import { subscription_cancel_failed } from "emails";

const { node } = subscription_cancel_failed.template({
  to_name: "Save The Rainforest Foundation",
  amount: { value: 25, currency: "USD", value_usd: 25 },
  interval: "month",
  interval_count: 1,
  subscriptions_url: "https://better.giving/dashboard/subscriptions",
});

export default () => node;
