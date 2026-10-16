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
    <div
      className={`${classes} relative isolate overflow-clip bg-linear-to-b from-background to-band pt-20 pb-24 md:pt-28 md:pb-32 text-center`}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 dot-grid dot-grid-fade"
      />
      <div className="page grid justify-items-center">
        <p className="eyebrow text-primary">About Better Giving</p>
        <h1 className="hero-heading mt-5 max-w-5xl">
          {"A nonprofit whose mission is "}
          <em className="text-primary">your mission's money</em>
        </h1>
        <p className="section-body mt-6 text-gray-11 max-w-3xl">
          Since 2021, we've helped 210+ nonprofits worldwide raise over $6M,
          with free tools, shared growth, and a simple belief: the organizations
          doing the work should keep the money.
        </p>
        <dl className="mt-14 md:mt-20 w-full max-w-3xl grid grid-cols-3 divide-x border-t pt-8 md:pt-10">
          {facts.map((f) => (
            // label first in the dom so it reads "nonprofits worldwide, 210+";
            // the figure leads visually
            <div key={f.value} className="flex flex-col-reverse gap-2 px-2">
              <dt className="text-xs md:text-sm text-gray-11 text-balance">
                {f.label}
              </dt>
              <dd className="display-figure text-4xl md:text-6xl slashed-zero">
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
