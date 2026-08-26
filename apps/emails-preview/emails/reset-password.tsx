import { reset_password } from "emails";

const { node } = reset_password.template({
  url: "https://better.giving/reset-password?token=preview-token",
  first_name: "John",
});

export default () => node;
