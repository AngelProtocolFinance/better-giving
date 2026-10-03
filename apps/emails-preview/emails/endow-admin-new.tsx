import { admin_endow_admin_new } from "emails";

const { node } = admin_endow_admin_new.template({
  base_url: "https://better.giving",
  first_name: "John",
  invitor: "Jane Smith",
  endow_name: "Save The Rainforest Foundation",
});

export default () => node;
