import { template } from "../src/templates/fnd-mgmt-lock-tx";

const { node } = template({
  transactor: "Better Giving",
  type: "invest",
  amount: "5,000.00",
  date: "Jan 4, 2026 at 3:45 PM UTC",
});

export default () => node;
