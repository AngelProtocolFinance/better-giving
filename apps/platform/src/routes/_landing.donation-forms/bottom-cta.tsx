import { href, Link } from "react-router";
import { BOOK_A_DEMO } from "#/constants/urls";

export function BottomCta({ className = "" }) {
  return (
    <div
      className={`${className} grid bg-linear-to-br from-primary to-secondary rounded md:rounded px-10 py-12 md:px-16`}
    >
      <h3 className="text-center md:text-left article-heading text-primary-fg mb-9">
        The all-in-one fundraising solution you deserve is only a few clicks
        away
      </h3>
      <div className="flex flex-col md:flex-row justify-center md:justify-start items-center gap-6">
        <Link
          to={href("/register")}
          className="btn md:btn-lg btn-primary font-bold"
        >
          Join us today!
        </Link>
        <Link
          to={BOOK_A_DEMO}
          className="btn md:btn-lg btn-secondary font-bold"
        >
          Book a Demo
        </Link>
      </div>
    </div>
  );
}
