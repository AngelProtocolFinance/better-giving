import { href } from "react-router";

/** `/login`, carrying the page to return to once signed in */
export const login_url = (redirect: string) =>
  `${href("/login")}?${new URLSearchParams({ redirect })}`;

/** `/signup`, carrying the page to return to once signed up */
export const signup_url = (redirect: string) =>
  `${href("/signup")}?${new URLSearchParams({ redirect })}`;
