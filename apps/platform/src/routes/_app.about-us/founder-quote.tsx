interface IFounderQuote {
  /** the ground comes from here — the inks below are `surface-deep`'s set */
  classes?: string;
}

export function FounderQuote({ classes = "" }: IFounderQuote) {
  return (
    <section className={classes} aria-label="From our founder">
      <div className="page">
        <figure className="reveal max-w-4xl grid">
          <blockquote className="display-quote-lg">
            We believe a new model of philanthropy is possible, not based on
            scarcity and dependence, but on abundance and financial
            self-sufficiency.
          </blockquote>
          <figcaption className="mt-10 text-blue-5">
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
