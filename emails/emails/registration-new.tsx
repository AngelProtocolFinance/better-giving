import { template } from "../src/templates/registration-new";

const { node } = template({
  reference_id: "REG-2025-001234",
});

export default () => node;
