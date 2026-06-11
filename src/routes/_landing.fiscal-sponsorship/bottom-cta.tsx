import { href, Link } from "react-router";
import { BOOK_A_DEMO } from "#/constants/urls";

export function BottomCta({ className = "" }) {
  return (
    <div
      className={`${className} grid bg-linear-to-br from-primary to-secondary rounded md:rounded px-10 py-12 md:px-16`}
    >
      <h3 className="text-center md:text-left article-heading text-primary-fg mb-9">
        Start accepting U.S. donations in days, not months.
      </h3>
      <div className="flex flex-col md:flex-row justify-center md:justify-start items-center gap-6">
        <Link
          to={href("/register/welcome")}
          className="btn btn-primary font-bold rounded px-6 py-2 md:px-10 md:py-5"
        >
          Join us today!
        </Link>
        <Link
          to={BOOK_A_DEMO}
          className="btn btn-secondary font-bold rounded px-6 py-2 md:px-10 md:py-5"
        >
          Book a Demo
        </Link>
      </div>
    </div>
  );
}
