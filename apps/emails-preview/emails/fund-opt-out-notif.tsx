import { fund_opt_out_notif } from "emails";

const { node } = fund_opt_out_notif.template({
  to_name: "John",
  opted_out_name: "Wildlife Conservation Society",
});

export default () => node;
