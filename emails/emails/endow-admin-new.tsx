import { template } from "../src/templates/admin-endow-admin-new";

const { node } = template({
  first_name: "John",
  invitor: "Jane Smith",
  endow_name: "Save The Rainforest Foundation",
});

export default () => node;
