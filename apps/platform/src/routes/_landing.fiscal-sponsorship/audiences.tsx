import { Earth, type LucideIcon, Sprout } from "lucide-react";
import type { CSSProperties } from "react";

interface IAudience {
  title: string;
  body: string;
  Icon: LucideIcon;
}

const audiences: IAudience[] = [
  {
    title: "Organizations outside the U.S.",
    body: "Grassroots and established nonprofits abroad often can't access IRS tax-exempt status, which shuts them out of U.S. donors and foundation grants. We bridge that gap: your U.S. supporters give tax-deductibly, we handle the legal and tax complexity, and grant the funds to you.",
    Icon: Earth,
  },
  {
    title: "U.S. groups without a 501(c)(3)",
    body: "New projects and community initiatives can start accepting tax-deductible donations right away: no incorporation, no year-long IRS wait. When you're ready to stand on your own, your donors and data go with you.",
    Icon: Sprout,
  },
];

interface IAudiences {
  classes?: string;
}

export function Audiences({ classes = "" }: IAudiences) {
  return (
    <section className={classes} aria-labelledby="audiences-heading">
      <div className="page">
        <h2 id="audiences-heading" className="section-heading max-w-2xl reveal">
          Who fiscal sponsorship is for
        </h2>
        <ul className="grid gap-6 md:grid-cols-2 mt-12 md:mt-16">
          {audiences.map(({ title, body, Icon }, i) => (
            <li
              key={title}
              className="tile reveal grid gap-5 content-start"
              style={{ "--reveal-order": i } as CSSProperties}
            >
              <span
                aria-hidden="true"
                className="size-12 rounded-full bg-surface text-primary grid place-items-center"
              >
                <Icon className="icon-2xl" />
              </span>
              <div className="grid gap-2.5">
                <h3 className="text-xl font-bold text-gray-12 text-balance">
                  {title}
                </h3>
                <p className="text-base/relaxed text-gray-11 text-pretty">
                  {body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
