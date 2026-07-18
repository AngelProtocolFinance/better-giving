import { template } from "../src/templates/cognito-resend-code";

const { node } = template({
  code: "261538",
  first_name: "John",
});

export default () => node;
