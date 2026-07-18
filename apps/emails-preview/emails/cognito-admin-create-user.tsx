import { cognito_admin_create_user } from "emails";

const { node } = cognito_admin_create_user.template({
  code: "739154",
  first_name: "John",
});

export default () => node;
