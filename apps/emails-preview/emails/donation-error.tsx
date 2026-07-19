import { donation_error } from "emails";

const { node } = donation_error.template({
  donor_first_name: "Jane",
  recipient_name: "Save The Rainforest Foundation",
  error_message:
    "Your payment was declined by your bank. Please try a different payment method or contact your bank for more information.",
});

export default () => node;
