import { donation_microdeposit_action } from "emails";

const { node } = donation_microdeposit_action.template({
  base_url: "https://better.giving",
  from_name: "Jane",
  to_name: "Save The Rainforest Foundation",
  verification_link: "https://better.giving/verify/abc123",
});

export default () => node;
