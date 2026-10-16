interface IFounderQuote {
  /** the ground comes from here — the inks below are `surface-deep`'s set */
  classes?: string;
}

export function FounderQuote({ classes = "" }: IFounderQuote) {
  return (
    <section
      className={`${classes} relative overflow-hidden`}
      aria-label="From our founder"
    >
      <div className="absolute inset-0 dot-grid dot-grid-fade" aria-hidden />
      <div className="page relative">
        <figure className="reveal max-w-4xl mx-auto grid justify-items-center text-center">
          <span
            className="display-figure text-7xl text-amber-6 h-10"
            aria-hidden
          >
            “
          </span>
          <blockquote className="display-quote mt-6">
            We believe a new model of philanthropy is possible, not based on
            scarcity and dependence, but on abundance and financial
            self-sufficiency.
          </blockquote>
          <span className="mt-10 w-12 border-t-2 border-amber-6" aria-hidden />
          <figcaption className="mt-6 text-blue-5">
            <span className="font-bold text-primary-fg max-sm:block">
              Chauncey St. John
            </span>
            <span className="max-sm:hidden"> - </span>
            Founder &amp; Executive Director
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
