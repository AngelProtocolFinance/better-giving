import { template } from "../src/templates/donation-private-message";

const { node } = template({
  to_name: "Save The Rainforest Foundation",
  from: {
    first_name: "John",
    full_name: "John Smith",
  },
  message:
    "I've been following your work for years and wanted to express my deep appreciation. The recent documentary about your conservation efforts in the Amazon was truly inspiring. Please keep up the incredible work!",
  amount: { value: 500, currency: "USD", value_usd: 500 },
  id: "TXN-2025-001234",
  date: "December 17, 2025",
});

export default () => node;
