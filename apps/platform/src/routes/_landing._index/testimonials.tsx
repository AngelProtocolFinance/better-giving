import type React from "react";
import casd from "#/assets/partners/casd-sl.webp";
import fora from "#/assets/partners/for-a-day-foundation.webp";

const quotes = [
  {
    quote:
      "I personally like to check our BG balance weekly. Looking at the endowment growth week by week gives me a little spark of inspiration.",
    name: "Jenna Edwards",
    org: "The For a Day Foundation",
    logo: fora,
  },
  {
    quote:
      "Better Giving has provided us with a powerful platform to engage donors, expand our reach, and make a tangible impact in the communities we serve in Sierra Leone.",
    name: "Brima Kabbah",
    org: "Community Action for Sustainable Development",
    logo: casd,
  },
] as const;

interface ITestimonials {
  classes?: string;
}

export function Testimonials({ classes = "" }: ITestimonials) {
  return (
    <section className={classes} aria-labelledby="testimonials-heading">
      <div className="page">
        <h2
          id="testimonials-heading"
          className="section-heading text-center reveal"
        >
          Nonprofits on Better Giving
        </h2>
        <div className="grid gap-16 md:grid-cols-2 md:gap-x-16 lg:gap-x-24 mt-14 md:mt-20">
          {quotes.map((q, i) => (
            <figure
              key={q.name}
              className="flex flex-col gap-6 reveal"
              style={{ "--reveal-order": i } as React.CSSProperties}
            >
              <span
                className="display-figure text-7xl text-primary h-7"
                aria-hidden
              >
                “
              </span>
              <blockquote className="display-quote">{q.quote}</blockquote>
              <figcaption className="flex items-center gap-4 mt-auto pt-4">
                <img
                  src={q.logo}
                  alt=""
                  className="flex-none h-11 w-auto object-contain"
                />
                <span className="grid">
                  <span className="font-bold">{q.name}</span>
                  <span className="text-sm text-gray-11">{q.org}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
