import { grants_schedule } from "emails";

const { node } = grants_schedule.template({
  rows: [
    {
      id: 1,
      name: "Save The Rainforest",
      amount: 250,
      min: 50,
      effect: "pass",
    },
    {
      id: 2,
      name: "Ocean Cleanup Fund",
      amount: 30,
      min: 50,
      effect: "skipped",
    },
    { id: 3, name: "Local Food Bank", amount: 1200, min: 100, effect: "pass" },
  ],
  total_grant: 1450,
  wise_usd_balance: 800,
  report_period: "2605",
  low_balance: false,
});

export default () => node;
