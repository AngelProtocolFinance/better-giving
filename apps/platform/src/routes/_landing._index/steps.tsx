import { Image } from "@better-giving/ui";
import type { CSSProperties } from "react";
import laira1 from "#/assets/laira/laira1.webp";
import laira2 from "#/assets/laira/laira2.webp";
import laira3 from "#/assets/laira/laira3.webp";

const steps = [
  {
    img: laira1,
    alt: "Laira holding the number 1",
    step: "01",
    title: "Sign up",
    body: "Register free in minutes. No fees, no contracts. You're a Member from day one.",
  },
  {
    img: laira2,
    alt: "Laira holding the number 2",
    step: "02",
    title: "Add the donation form",
    body: "Brand it and embed it on your site. Fewer clicks and express checkout mean more completed gifts and monthly donors.",
  },
  {
    img: laira3,
    alt: "Laira holding the number 3",
    step: "03",
    title: "Grow",
    body: "Get payouts within 5 working days, or route a share into savings and the Sustainability Fund.",
  },
] as const;

interface ISteps {
  classes?: string;
}

export function Steps({ classes = "" }: ISteps) {
  return (
    <section className={classes} aria-labelledby="steps-heading">
      <div className="page">
        <h2 id="steps-heading" className="section-heading text-center reveal">
          Easy as <em className="text-primary">1-2-3</em>
        </h2>
        <div className="relative mt-16 md:mt-20">
          {/* the md+ connector, from the first medallion's centre to the
              last's; each medallion's own fill hides the line behind it */}
          <span
            aria-hidden="true"
            className="absolute top-14 left-1/6 right-1/6 border-t-2 border-dashed border-gray-7 max-md:hidden"
          />
          <ol className="grid gap-12 md:grid-cols-3 md:gap-8">
            {steps.map((s, i) => (
              <li
                key={s.step}
                className="reveal relative grid content-start grid-cols-[auto_1fr] gap-x-6 md:grid-cols-1 md:justify-items-center md:text-center"
                style={{ "--reveal-order": i } as CSSProperties}
              >
                {/* below md the connector runs down the medallion column, one
                  segment per gap: centre of this medallion to the next's */}
                {i < steps.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="absolute left-10 top-10 -bottom-22 border-l-2 border-dashed border-gray-7 md:hidden"
                  />
                )}
                <div className="relative row-span-2 md:row-span-1">
                  <span className="relative flex-center size-20 md:size-28 rounded-full border bg-surface display-figure text-4xl md:text-6xl text-primary">
                    {s.step}
                  </span>
                  <Image
                    src={s.img}
                    alt={s.alt}
                    className="absolute -right-16 -bottom-3 h-24 w-auto max-md:hidden"
                  />
                </div>
                <h3 className="text-2xl font-bold text-balance self-center md:self-auto md:mt-8">
                  {s.title}
                </h3>
                <p className="mt-2 text-base/relaxed text-gray-11 text-pretty max-w-80">
                  {s.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
