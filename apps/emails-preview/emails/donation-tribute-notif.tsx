import { donation_tribute_notif } from "emails";

const { node } = donation_tribute_notif.template({
  in_honor_of: "Grandma Rose",
  notif_to_full_name: "Mary Johnson",
  from: {
    first_name: "Jane",
    full_name: "Jane Doe",
    title: "Dr.",
  },
  to_name: "Save The Rainforest Foundation",
  amount: { value: 100, currency: "USD", value_usd: 100 },
  from_msg:
    "In loving memory of Grandma Rose, who always loved nature and taught us to protect our planet.",
});

export default () => node;
