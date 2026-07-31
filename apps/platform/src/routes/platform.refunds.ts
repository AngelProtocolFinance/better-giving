import { redirect } from "react-router";
import { routes } from "./platform/routes";

// the page generalized to /platform/donations. js from an older deploy still
// carries `<Link to="/platform/refunds">`, and skew protection here is a
// redirect rather than a 404.
export const loader = () => redirect(`/platform/${routes.donations}`);
