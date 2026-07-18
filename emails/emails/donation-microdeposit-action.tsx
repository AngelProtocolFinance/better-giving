import { template } from "../src/templates/donation-microdeposit-action";

const { node } = template({
  from_name: "Jane",
  to_name: "Save The Rainforest Foundation",
  verification_link: "https://better.giving/verify/abc123",
});

export default () => node;
