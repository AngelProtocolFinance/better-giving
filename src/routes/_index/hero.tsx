import { href, Link } from "react-router";
import banner from "#/assets/images/bg-banner.webp";
import { app_name } from "#/constants/env";

export const Hero = ({ classes = "" }) => {
  return (
    <section
      className={`${classes} relative grid pt-36 pb-48 sm:pb-96`}
      aria-label="Hero section"
    >
      <img
        src={banner}
        alt=""
        aria-hidden="true"
        fetchPriority="high"
        className="absolute inset-0 -z-10 w-full h-full object-cover object-[center_-10%] xl:object-[center_bottom]"
        style={{
          maskImage: "linear-gradient(to bottom, black 30%, transparent)",
        }}
      />
      <p className="pre-heading uppercase text-center mb-5 tracking-wider">
        By a nonprofit, for nonprofits
      </p>
      <h1 className="mx-auto capitalize hero-heading text-center mb-8 px-6 ">
        Raise more this quarter, <br /> Grow funds together
      </h1>
      <p className="px-6 font-medium max-w-5xl mx-auto max-md:block md:text-2xl text-center sm:text-balance min-h-20 md:min-h-16">
        When you sign up, you're a {app_name} Member, no extra steps, no fees.
        Our high-converting donation flow lifts completed gifts and monthly
        donors. Savings and a pooled Sustainability Fund build reserves over
        time.
      </p>

      <Link
        to={href("/register/welcome")}
        className="justify-self-center mt-8 btn btn-primary items-center font-bold inline-flex px-10 py-3 gap-1 rounded text-lg"
      >
        Join us today!
      </Link>
    </section>
  );
};
