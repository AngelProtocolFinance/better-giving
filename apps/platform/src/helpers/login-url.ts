import { href } from "react-router";

/** `/login`, carrying the page to return to once signed in */
export const login_url = (redirect: string) =>
  `${href("/login")}?${new URLSearchParams({ redirect })}`;
