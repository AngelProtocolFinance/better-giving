import { npo_terms_notice } from "emails";

const { node } = npo_terms_notice.template({
  base_url: "https://better.giving",
});

export default () => node;
