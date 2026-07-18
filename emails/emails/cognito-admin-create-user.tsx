import { template } from "../src/templates/cognito-admin-create-user";

const { node } = template({
  code: "739154",
  first_name: "John",
});

export default () => node;
