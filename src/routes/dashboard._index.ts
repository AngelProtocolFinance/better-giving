import { redirect } from "react-router";
import { routes } from "./dashboard/routes";
export const loader = () => redirect(routes.edit_profile);
