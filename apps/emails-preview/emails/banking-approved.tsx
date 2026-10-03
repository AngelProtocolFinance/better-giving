import { banking } from "emails";

const { node } = banking.template({
  base_url: "https://better.giving",
  action: "approved",
  account_summary: "Chase Bank ending in 1234",
});

export default () => node;
