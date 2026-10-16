/** the standfirst's own three facts, lifted out as figures — nothing here that
 *  the paragraph above it doesn't already say */
const facts = [
  { value: "2021", label: "serving nonprofits since" },
  { value: "210+", label: "nonprofits worldwide" },
  { value: "$6M+", label: "raised for partners" },
] as const;

interface IHero {
  classes?: string;
}

export function Hero({ classes = "" }: IHero) {
  return (
    <div className={`${classes} pt-20 pb-24 md:pt-28 md:pb-32`}>
      <div className="page grid justify-items-start">
        <h1 className="hero-heading max-w-5xl">
          A nonprofit whose mission is your mission's money
        </h1>
        <p className="section-body mt-6 text-gray-11 max-w-3xl">
          Since 2021, we've helped 210+ nonprofits worldwide raise over $6M,
          with free tools, shared growth, and a simple belief: the organizations
          doing the work should keep the money.
        </p>
        <dl className="mt-16 md:mt-24 w-full max-w-4xl grid grid-cols-3 gap-6 md:gap-16">
          {facts.map((f) => (
            // label first in the dom so it reads "nonprofits worldwide, 210+";
            // the figure leads visually
            <div key={f.value} className="flex flex-col-reverse gap-2">
              <dt className="text-xs md:text-sm text-gray-11 text-balance">
                {f.label}
              </dt>
              <dd className="display-figure text-4xl md:text-7xl slashed-zero">
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
