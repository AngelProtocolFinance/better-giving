import { template } from "../src/templates/fund-opt-out-notif";

const { node } = template({
  to_name: "John",
  opted_out_name: "Wildlife Conservation Society",
});

export default () => node;
