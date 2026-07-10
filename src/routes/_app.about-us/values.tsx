import { ArrowRight } from "lucide-react";
import { ExtLink } from "#/components/ext-link";
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

export function Values({ classes = "" }: IValues) {
  return (
    <section className={classes} aria-labelledby="values-heading">
      <div className="max-w-6xl mx-auto">
        <h2
          id="values-heading"
          className="section-heading text-center max-w-2xl mx-auto"
        >
          What we hold ourselves to
        </h2>
        <div className="grid gap-5 md:grid-cols-3 mt-11">
          {values.map((v) => (
            <div
              key={v.title}
              className="bg-card border border-border rounded-lg p-7 grid gap-2 content-start"
            >
              <span className="text-xl font-bold">{v.title}</span>
              <p className="text-sm/relaxed text-muted-fg">{v.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-sm/relaxed text-muted-fg max-w-2xl mx-auto">
          Better Giving is a registered 501(c)(3) public charity, EIN
          87-3758939.{" "}
          <ExtLink
            href={guidestar.profile}
            className="font-bold text-primary hover:underline"
          >
            View our transparency profile on Candid{" "}
            <ArrowRight className="inline size-4 align-middle" />
          </ExtLink>
        </p>
      </div>
    </section>
  );
}
