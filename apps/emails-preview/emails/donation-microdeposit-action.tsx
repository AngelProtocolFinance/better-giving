import { donation_microdeposit_action } from "emails";

const { node } = donation_microdeposit_action.template({
  from_name: "Jane",
  to_name: "Save The Rainforest Foundation",
  verification_link: "https://better.giving/verify/abc123",
});

export default () => node;
