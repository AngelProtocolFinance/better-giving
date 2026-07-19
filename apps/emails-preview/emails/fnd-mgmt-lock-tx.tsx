import { fnd_mgmt_lock_tx } from "emails";

const { node } = fnd_mgmt_lock_tx.template({
  transactor: "Better Giving",
  type: "invest",
  amount: "5,000.00",
  date: "Jan 4, 2026 at 3:45 PM UTC",
});

export default () => node;
