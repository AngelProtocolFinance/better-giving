import { href, redirect } from "react-router";

// /nonprofit renamed to /product; keep old links alive
export const loader = async () => redirect(href("/product"), 301);
