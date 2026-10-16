import { EIN } from "@better-giving/brand";
import { ExtLink } from "@better-giving/ui";
import { ArrowRight, ShieldCheck, Sprout, Users } from "lucide-react";
import type { CSSProperties } from "react";
import { guidestar } from "#/constants/urls";

const values = [
  {
    title: "Integrity",
    Icon: ShieldCheck,
    body: "Radical transparency: open code, open books, and a public Candid/GuideStar profile.",
  },
  {
    title: "Sustainability",
    Icon: Sprout,
    body: "Long-term financial health, for your organization, and for the commons itself.",
  },
  {
    title: "Inclusivity",
    Icon: Users,
    body: "All nonprofits, any size, anywhere: the same tools on the same terms.",
  },
] as const;

interface IValues {
  classes?: string;
}

export function Values({ classes = "" }: IValues) {
  return (
    <section className={classes} aria-labelledby="values-heading">
      <div className="page">
        <h2
          id="values-heading"
          className="section-heading text-center max-w-2xl mx-auto reveal"
        >
          What we hold ourselves to
        </h2>
        <ul className="mt-14 md:mt-20 grid gap-12 md:grid-cols-3 md:gap-10 lg:gap-16">
          {values.map(({ title, Icon, body }, i) => (
            <li
              key={title}
              className="reveal grid content-start justify-items-center gap-4 text-center"
              style={{ "--reveal-order": i } as CSSProperties}
            >
              <span
                aria-hidden
                className="size-16 rounded-full border bg-surface text-primary grid place-items-center"
              >
                <Icon className="pictogram-sm" strokeWidth={1.5} />
              </span>
              <h3 className="mt-2 text-xl font-bold">{title}</h3>
              <p className="text-base/relaxed text-gray-11 text-pretty max-w-xs">
                {body}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-16 md:mt-20 border-t pt-8 text-center text-sm/relaxed text-gray-11 text-pretty">
          Better Giving is a registered 501(c)(3) public charity, EIN {EIN}.{" "}
          <ExtLink href={guidestar.profile} className="font-bold link">
            View our transparency profile on Candid{" "}
            <ArrowRight className="inline icon-md align-middle" />
          </ExtLink>
        </p>
      </div>
    </section>
  );
}
