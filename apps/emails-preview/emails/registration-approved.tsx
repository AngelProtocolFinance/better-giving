import { registration_approved } from "emails";

const { node } = registration_approved.template({
  base_url: "https://better.giving",
  org_name: "Save The Rainforest Foundation",
  registrant_first_name: "Jane",
  endow_id: "12345",
});

export default () => node;
