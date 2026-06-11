import { redirect } from "react-router";
import { routes } from "./platform/routes";
export const loader = () => redirect(routes.applications);
