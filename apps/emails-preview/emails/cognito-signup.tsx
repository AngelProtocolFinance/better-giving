import { cognito_signup } from "emails";

const { node } = cognito_signup.template({
  code: "482916",
  first_name: "John",
});

export default () => node;
