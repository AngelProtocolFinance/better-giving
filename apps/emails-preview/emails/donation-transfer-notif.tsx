import { donation_transfer_notif } from "emails";

const { node } = donation_transfer_notif.template({
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
