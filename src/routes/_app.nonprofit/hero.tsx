import { href, Link } from "react-router";
import { Video, videos } from "#/components/video/video";
import { BOOK_A_DEMO } from "#/constants/urls";

export function Hero({ className = "" }) {
  return (
    <section
      className={`${className} grid justify-items-center gap-10 @6xl:justify-items-start @6xl:grid-cols-2 py-24`}
    >
      <div className="max-w-2xl order-2 @6xl:order-1">
        <h4 className="text-center @6xl:text-left @6xl:text-lg uppercase mb-5">
          Funding Today, Funding Forever
        </h4>
        <h1 className="text-center @6xl:text-left text-4.5xl @6xl:text-5xl @6xl:leading-tight text-balance mb-4">
          Raise funds easily. <br /> Grow them effortlessly.
        </h1>
        <p className="mb-10 text-lg @6xl:text-xl text-center @6xl:text-left">
          Better Giving streamlines donations, simplifies administration, and
          helps your nonprofit grow its funds—all through an easily embeddable
          donation form. As a 501(c)(3) ourselves, we accept donations on your
          behalf, automate tax receipts, and grant 100% of the funds to you—no
          fees, no hassle.
        </p>

        <div className="flex flex-col @sm:flex-row justify-center @6xl:justify-start items-center gap-6">
          <Link
            to={href("/register/welcome")}
            className="btn btn-primary px-6 py-2 @6xl:px-10 @6xl:py-4 @6xl:text-lg font-bold rounded"
          >
            Start Today
          </Link>
          <Link
            to={BOOK_A_DEMO}
            className="btn btn-secondary font-bold rounded px-6 py-2 @6xl:px-8 @6xl:py-4 @6xl:text-xl"
          >
            Book a Demo
          </Link>
        </div>
      </div>
      <Video
        classes="max-w-2xl @6xl:max-w-auto order-1 @6xl:order-2 w-full self-center"
        vid={videos.about}
      />
    </section>
  );
}
