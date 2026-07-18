import { template } from "../src/templates/donation-transfer-notif";

const { node } = template({
  type: "stocks",
  recipient_name: "Save The Rainforest Foundation",
  recipient_url: "https://better.giving/save-the-rainforest",
  donor_email: "jane@example.com",
  details: {
    ticker: "AAPL",
    shares: "10",
    amount: "2,350.00",
  },
});

export default () => node;
