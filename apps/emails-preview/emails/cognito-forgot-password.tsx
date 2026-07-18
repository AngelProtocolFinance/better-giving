import { cognito_forgot_password } from "emails";

const { node } = cognito_forgot_password.template({
  code: "739154",
  first_name: "John",
});

export default () => node;
