import { registration_new } from "emails";

const { node } = registration_new.template({
  reference_id: "REG-2025-001234",
  resume_url:
    "https://better.giving/api/auth/magic-link/verify?token=preview-token&callbackURL=%2Fregister%2FREG-2025-001234%2F4",
});

export default () => node;
