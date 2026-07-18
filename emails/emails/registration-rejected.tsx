import { template } from "../src/templates/registration-rejected";

const { node } = template({
  registrant_first_name: "Jane",
  rejection_reason:
    "The organization's 501(c)(3) status could not be verified. Please provide a valid IRS determination letter.",
});

export default () => node;
