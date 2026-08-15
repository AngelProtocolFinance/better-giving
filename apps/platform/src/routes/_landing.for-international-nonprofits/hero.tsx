import { href, Link } from "react-router";
import { ExtLink } from "#/components/ext-link";
import { BOOK_A_DEMO } from "#/constants/urls";
import type { ILeadValues } from "@/reg/lead";
import { EligibilityForm, type IEligibilityErrors } from "./eligibility-form";

interface IHero {
  classes?: string;
  errors?: IEligibilityErrors;
  /** the last submit's posted values and mismatched session, passed straight
   * through to the form that owns them */
  values?: ILeadValues;
  signed_in_as?: string;
  pending?: boolean;
}

export function Hero({
  classes = "",
  errors,
  values,
  signed_in_as,
  pending,
}: IHero) {
  return (
    <header className={classes}>
      <div className="max-w-6xl mx-auto grid gap-8 lg:gap-12 lg:grid-cols-[1.05fr_0.95fr] items-start">
        <div className="grid gap-5 justify-items-start">
          <p className="eyebrow text-muted-fg">
            For international nonprofits · Fiscal sponsorship
          </p>
          <h1 className="hero-heading max-w-2xl">
            Unlock U.S. donors without a 501(c)(3)
          </h1>
          <p className="section-body text-muted-fg max-w-xl">
            U.S. donors give more when gifts are tax-deductible. Our fiscal
            sponsorship makes that possible for your organization at 2.9%,
            versus the 4-10% market rate.
          </p>
          <div className="flex flex-wrap gap-3 max-sm:w-full">
            <Link
              to={href("/register")}
              className="btn btn-primary px-5 py-3 max-sm:flex-1"
            >
              Unlock U.S. donors
            </Link>
            <ExtLink
              href={BOOK_A_DEMO}
              className="btn btn-secondary px-5 py-3 max-sm:flex-1"
            >
              Book a demo
            </ExtLink>
          </div>
        </div>

        <EligibilityForm
          errors={errors}
          values={values}
          signed_in_as={signed_in_as}
          pending={pending}
        />
      </div>
    </header>
  );
}
