import { href } from "react-router";

/** `/login`, carrying the page the donor started from back to it */
export const back_to_login = (to: string) =>
  `${href("/login")}?${new URLSearchParams({ redirect: to })}`;
