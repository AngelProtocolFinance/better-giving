import { template } from "../src/templates/banking";

const { node } = template({
  action: "default",
  account_summary: "Chase Bank ending in 1234",
});

export default () => node;
