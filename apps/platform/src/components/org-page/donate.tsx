import type { Ref } from "react";
import { Link } from "react-router";

interface IDonateButton {
  /** the donate route; the caller's, never built here */
  to: string;
  /** lg in the hero */
  size?: "md" | "lg";
  /** the hero's Donate takes one, so the header can tell when it has left */
  ref?: Ref<HTMLAnchorElement>;
  classes?: string;
}

/** the filled Donate, always on the page's ground: on Poster's deep band it
 * sits inside the give panel */
export function DonateButton({
  to,
  size = "md",
  ref,
  classes = "",
}: IDonateButton) {
  return (
    <Link
      ref={ref}
      to={to}
      className={`btn btn-primary ${size === "lg" ? "btn-lg" : ""} ${classes}`}
    >
      Donate
    </Link>
  );
}
