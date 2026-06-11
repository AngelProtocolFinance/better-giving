import { href, Link } from "react-router";
import laira_waiving from "#/assets/laira/laira-waiving.webp";
import { Image } from "#/components/image";
import { BOOK_A_DEMO } from "#/constants/urls";

export function BottomCta({ className = "" }) {
  return (
    <div
      className={`${className} grid md:grid-cols-[3fr_1fr] bg-linear-to-br from-primary to-secondary rounded md:rounded px-10 py-12 md:px-16 md:py-[4.5rem]`}
    >
      <div className="order-2 md:order-1">
        <h4 className="text-center md:text-left uppercase [28rem]:text-lg text-primary-fg leading-normal mb-6">
          Simple. Sustainable. Free.
        </h4>
        <h3 className="text-center md:text-left md:leading-snug  text-2xl @md:text-4xl text-primary-fg mb-9">
          The all-in-one fundraising solution you deserve is only a few clicks
          away
        </h3>
        <div className="flex flex-col md:flex-row justify-center md:justify-start items-center gap-6">
          <Link
            to={href("/register/welcome")}
            className="btn btn-primary font-bold rounded px-8 py-3 md:px-12 md:py-6"
          >
            Start Today
          </Link>
          <Link
            to={BOOK_A_DEMO}
            className="btn btn-secondary font-bold rounded px-8 py-3 md:px-12 md:py-6"
          >
            Book a Demo
          </Link>
        </div>
      </div>
      <Image
        width={140}
        src={laira_waiving}
        className="place-self-center mb-8 order-1 md:order-2"
      />
    </div>
  );
}
