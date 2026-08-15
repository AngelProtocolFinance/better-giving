import { login_link } from "emails";

const { node } = login_link.template({
  url: "https://better.giving/api/auth/magic-link/verify?token=preview-token",
  expires_in: "1 hour",
  first_name: "John",
});

export default () => node;
