import { href, Link } from "react-router";
import logo_white from "#/assets/images/bettergiving-logo-white.webp";
import {
  BOOK_A_DEMO,
  guidestar,
  INTERCOM_HELP,
  socials,
} from "#/constants/urls";
import { ExtLink } from "../ext-link";
import { NewsletterForm } from "./newsletter-form";

type Props = { classes?: string };

const platform = [
  { label: "Product", to: href("/product") },
  { label: "Fund Management", to: href("/fund-management") },
  { label: "Fiscal Sponsorship", to: href("/fiscal-sponsorship") },
  { label: "Open Source", to: href("/open-source") },
  { label: "Pricing", to: href("/pricing") },
  { label: "Marketplace", to: href("/marketplace") },
  { label: "Fundraisers", to: href("/fundraisers") },
  { label: "Referral Program", to: href("/referral-program") },
] as const;

const social_links = [
  { label: "LinkedIn", url: socials.linkedin },
  { label: "Facebook", url: socials.facebook },
  { label: "X", url: socials.x },
  { label: "YouTube", url: socials.youtube },
  { label: "Instagram", url: socials.instagram },
] as const;

const link_cls = "text-sm text-primary-fg/75 hover:text-primary-fg";

export function Footer({ classes = "" }: Props) {
  return (
    <footer
      className={`${classes} bg-primary border-t border-primary-fg/10 px-6 md:px-12 pt-16 pb-10`}
    >
      <div className="max-w-6xl mx-auto grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.3fr]">
        <div className="grid content-start gap-4 justify-items-start">
          <Link to={href("/")} title="Go to Home page">
            <img src={logo_white} alt="Better Giving" className="w-36 h-auto" />
          </Link>
          <p className="text-sm/relaxed text-primary-fg/75 max-w-70 text-pretty">
            A member-powered, open-source fundraising and financial commons for
            nonprofits.
          </p>
          <p className="text-xs/relaxed text-primary-fg/60">
            Better Giving is a 501(c)(3) nonprofit.
            <br />
            EIN 87-3758939
          </p>
          <ExtLink href={guidestar.profile} className="inline-flex">
            <img
              src={guidestar.seal}
              alt="Candid GuideStar Transparency Seal"
              className="h-18 w-auto"
            />
          </ExtLink>
        </div>

        <nav aria-label="Platform" className="grid content-start gap-2.5">
          <span className="text-sm font-bold text-primary-fg mb-1">
            Platform
          </span>
          {platform.map((l) => (
            <Link key={l.to} to={l.to} className={link_cls}>
              {l.label}
            </Link>
          ))}
        </nav>

        <nav aria-label="Organization" className="grid content-start gap-2.5">
          <span className="text-sm font-bold text-primary-fg mb-1">
            Organization
          </span>
          <Link to={href("/about-us")} className={link_cls}>
            About &amp; Mission
          </Link>
          <Link to={href("/blog")} className={link_cls}>
            Blog &amp; Resources
          </Link>
          <ExtLink href={INTERCOM_HELP} className={link_cls}>
            FAQs
          </ExtLink>
          <ExtLink href={BOOK_A_DEMO} className={link_cls}>
            Book a demo
          </ExtLink>
          <Link to={href("/register/welcome")} className={link_cls}>
            Sign up
          </Link>
        </nav>

        <div className="grid content-start gap-3">
          <span className="text-sm font-bold text-primary-fg">
            Stay in the loop
          </span>
          <NewsletterForm />
          <div className="flex flex-wrap gap-x-3.5 gap-y-1 mt-1.5">
            {social_links.map((s) => (
              <ExtLink
                key={s.label}
                href={s.url}
                className="text-xs font-medium text-primary-fg/75 hover:text-primary-fg"
              >
                {s.label}
              </ExtLink>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto mt-10 pt-5 border-t border-primary-fg/10 flex flex-wrap justify-between gap-x-6 gap-y-2.5">
        <span className="text-xs/relaxed text-primary-fg/60 text-pretty">
          Past performance of the Sustainability Fund is not indicative of
          future results; all investments carry risk. ©{" "}
          {new Date().getFullYear()} Better Giving.
        </span>
        <span className="flex gap-4">
          <Link
            to={href("/privacy-policy")}
            className="text-xs text-primary-fg/60 hover:text-primary-fg"
          >
            Privacy Policy
          </Link>
          <Link
            to={href("/security-policy")}
            className="text-xs text-primary-fg/60 hover:text-primary-fg"
          >
            Security
          </Link>
          <Link
            to={href("/terms-of-use")}
            className="text-xs text-primary-fg/60 hover:text-primary-fg"
          >
            Terms of Use
          </Link>
        </span>
      </div>
    </footer>
  );
}
