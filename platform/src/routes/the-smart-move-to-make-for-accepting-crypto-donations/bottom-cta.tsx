import { href, Link } from "react-router";
import logo from "#/assets/images/bg-logo.webp";
import laira_pointing from "#/assets/laira/laira-pointing.webp";
import { Image } from "#/components/image";

export function BottomCta({ className = "" }) {
  return (
    <div
      className={`${className} grid sm:grid-cols-[3fr_1fr] bg-linear-to-tr from-primary to-white rounded sm:rounded px-8 py-8 sm:px-12 sm:py-12`}
    >
      <div className="order-2 sm:order-1">
        <h4 className="text-center sm:text-left uppercase sm:text-lg text-primary-fg leading-normal mb-6">
          Simple. Sustainable. Free.
        </h4>
        <h3 className="text-center sm:text-left sm:leading-snug  text-2xl text-primary-fg mb-9">
          Stop paying for what should be free
        </h3>
        <div className="relative max-sm:justify-self-center">
          <Link
            to={href("/register/welcome")}
            className="btn btn-primary font-bold rounded px-6 py-2 sm:px-10 sm:py-4"
          >
            Start Today
          </Link>
          <div className="absolute -left-20 isolate">
            <Image
              src={laira_pointing}
              width={90}
              className="z-10 max-sm:w-24"
            />
            {/** shadow */}
            <svg
              className="absolute -bottom-3 z-0"
              width="100%"
              height="20"
              aria-hidden="true"
            >
              <defs>
                <filter id="blur">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
                </filter>
              </defs>
              <ellipse
                cx="50%"
                cy="50%"
                rx="40"
                ry="6"
                filter="url(#blur)"
                className="fill-muted"
                // className="blur-sm"
              />
            </svg>
          </div>
        </div>
      </div>
      <Image
        alt="Letters B & G forming a circle like 8"
        width={120}
        src={logo}
        className="place-self-center mb-8 order-1 sm:order-2 max-xl:w-28"
      />
    </div>
  );
}
