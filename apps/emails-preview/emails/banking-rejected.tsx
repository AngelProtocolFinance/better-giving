import { banking } from "emails";

const { node } = banking.template({
  action: "rejected",
  account_summary: "Chase Bank ending in 1234",
  rejection_reason:
    "The account name does not match the organization's legal name on file.",
});

export default () => node;
