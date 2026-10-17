import { Image } from "@better-giving/ui";
import type { CSSProperties } from "react";
import laira1 from "#/assets/laira/laira1.webp";
import laira2 from "#/assets/laira/laira2.webp";
import laira3 from "#/assets/laira/laira3.webp";

const steps = [
  {
    img: laira1,
    title: "Sign up",
    body: "Register online. No platform fee while the optional donor contribution stays on. Turning that ask off is a 1.5% fee.",
  },
  {
    img: laira2,
    title: "Add the donation form",
    body: "Brand it and embed it on your site. Fewer clicks and express checkout mean more completed gifts and monthly donors.",
  },
  {
    img: laira3,
    title: "Grow",
    body: "Grants and withdrawal requests are reviewed and processed on a monthly basis. You can also route a share into savings and the Sustainability Fund.",
  },
] as const;

interface ISteps {
  classes?: string;
}

export function Steps({ classes = "" }: ISteps) {
  return (
    <section className={classes} aria-labelledby="steps-heading">
      <div className="page">
        <h2 id="steps-heading" className="section-heading reveal">
          Easy as 1-2-3
        </h2>
        <ol className="grid gap-5 md:grid-cols-3 mt-12 md:mt-16">
          {steps.map((s, i) => (
            <li
              key={s.title}
              className="tile reveal grid content-start gap-x-5 gap-y-3 max-md:grid-cols-[auto_1fr]"
              style={{ "--reveal-order": i } as CSSProperties}
            >
              <Image
                src={s.img}
                alt=""
                className="h-20 md:h-28 w-auto max-md:row-span-2 md:mb-5"
              />
              <h3 className="subsection-heading">{s.title}</h3>
              <p className="text-base/relaxed text-gray-11 text-pretty">
                {s.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
