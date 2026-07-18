import { template } from "../src/templates/cognito-signup";

const { node } = template({
  code: "482916",
  first_name: "John",
});

export default () => node;
