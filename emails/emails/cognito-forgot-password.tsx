import { template } from "../src/templates/cognito-forgot-password";

const { node } = template({
  code: "739154",
  first_name: "John",
});

export default () => node;
