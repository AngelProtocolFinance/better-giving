import { motion } from "motion/react";
import tdz from "#/assets/partners/territorio-de-zaguates.webp";
import { static_url } from "#/constants/urls";

interface IFmTestimonial {
  quote: string;
  reviewer?: string;
  org: string;
  logo?: string;
}

const testimonials: IFmTestimonial[] = [
  {
    quote:
      "We are in love with the easy process Better Giving has created to start an endowment. We always focused on recurring giving with donors. This takes it to the next level. I think we can grow our endowment to preserve our efforts through time.",
    org: "Territorio de Zaguates",
    logo: tdz,
  },
  {
    quote:
      "Having an untied, passive income stream from an endowment is highly appealing to complement our other revenue streams.",
    reviewer: "Sarah Hornby",
    org: "ygap",
    logo: static_url("partners/1.webp"),
  },
  {
    quote:
      "I personally like to check our Better Giving balance weekly. Looking at the endowment growth week by week gives me a little spark of inspiration. The network of Better Giving's audience seems to be incredibly responsive to financial empowerment. We hope to tap into that.",
    reviewer: "Jenna Edwards",
    org: "The For a Day Foundation",
    logo: static_url("partners/58.webp"),
  },
];

export function Testimonials({ classes = "" }) {
  return (
    <section
      className={`${classes} grid`}
      aria-labelledby="fm-testimonials-heading"
    >
      <h2
        id="fm-testimonials-heading"
        className="text-center font-bold text-3xl/tight md:text-4_5xl/tight tracking-tight"
      >
        Hear What Nonprofits Have to Say!
      </h2>

      <div className="grid md:grid-cols-3 gap-6 mt-14">
        {testimonials.map((t, idx) => (
          <motion.article
            key={t.org}
            className="border border-border rounded-md bg-card p-7 flex flex-col gap-6 min-h-80"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ type: "spring", delay: idx * 0.1 }}
          >
            <span
              aria-hidden="true"
              className="font-serif text-5xl leading-none text-muted-fg/40 h-6"
            >
              &ldquo;
            </span>
            <blockquote className="flex-1 text-[15px] leading-relaxed not-italic">
              {t.quote}
            </blockquote>
            <div className="flex items-center gap-4 pt-5 border-t border-border">
              {t.logo && (
                <img
                  src={t.logo}
                  alt={`${t.org} logo`}
                  className="h-10 max-w-[120px] object-contain shrink-0"
                />
              )}
              {t.reviewer && (
                <p className="text-sm font-bold leading-tight">{t.reviewer}</p>
              )}
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  );
}
