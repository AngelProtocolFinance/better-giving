import { EIN } from "@better-giving/brand";
import { ExtLink } from "@better-giving/ui";
import { ArrowRight } from "lucide-react";
import type { CSSProperties } from "react";
import { guidestar } from "#/constants/urls";

const values = [
  {
    title: "Integrity",
    body: "Radical transparency: open code, open books, and a public Candid/GuideStar profile.",
  },
  {
    title: "Sustainability",
    body: "Long-term financial health, for your organization, and for the commons itself.",
  },
  {
    title: "Inclusivity",
    body: "All nonprofits, any size, anywhere: the same tools on the same terms.",
  },
] as const;

interface IValues {
  classes?: string;
}

// the heading holds the left column; the values read down the right as a
// list. from md the rows share one subgrid, so every sentence starts on the
// same line past the longest title
export function Values({ classes = "" }: IValues) {
  return (
    <section className={classes} aria-labelledby="values-heading">
      <div className="page grid gap-14 lg:gap-24 lg:grid-cols-[5fr_7fr]">
        <h2 id="values-heading" className="section-heading max-w-md reveal">
          What we hold ourselves to
        </h2>
        <div>
          <ul className="grid gap-10 md:grid-cols-[auto_1fr] md:gap-x-10 md:gap-y-12">
            {values.map(({ title, body }, i) => (
              <li
                key={title}
                className="reveal grid gap-2 md:col-span-2 md:grid-cols-subgrid md:items-baseline"
                style={{ "--reveal-order": i } as CSSProperties}
              >
                <h3 className="subsection-heading">{title}</h3>
                <p className="text-lg/relaxed text-gray-11 text-pretty">
                  {body}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-14 md:mt-16 text-sm/relaxed text-gray-11 text-pretty">
            Better Giving is a registered 501(c)(3) public charity, EIN {EIN}.{" "}
            <ExtLink href={guidestar.profile} className="font-bold link">
              View our transparency profile on Candid{" "}
              <ArrowRight className="inline icon-md align-middle" />
            </ExtLink>
          </p>
        </div>
      </div>
    </section>
  );
}
