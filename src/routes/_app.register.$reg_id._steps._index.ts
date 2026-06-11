import { type LoaderFunction, redirect } from "react-router";
import { steps } from "#/pages/registration/routes";
export const loader: LoaderFunction = () => redirect(steps.contact);
