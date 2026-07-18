import { cognito_resend_code } from "emails";

const { node } = cognito_resend_code.template({
  code: "261538",
  first_name: "John",
});

export default () => node;
