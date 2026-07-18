import { template } from "../src/templates/banking";

const { node } = template({
  action: "rejected",
  account_summary: "Chase Bank ending in 1234",
  rejection_reason:
    "The account name does not match the organization's legal name on file.",
});

export default () => node;
