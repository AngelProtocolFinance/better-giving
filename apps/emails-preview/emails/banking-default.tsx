import { banking } from "emails";

const { node } = banking.template({
  action: "default",
  account_summary: "Chase Bank ending in 1234",
});

export default () => node;
