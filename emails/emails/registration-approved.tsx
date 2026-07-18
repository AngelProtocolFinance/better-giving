import { template } from "../src/templates/registration-approved";

const { node } = template({
  org_name: "Save The Rainforest Foundation",
  registrant_first_name: "Jane",
  endow_id: "12345",
});

export default () => node;
