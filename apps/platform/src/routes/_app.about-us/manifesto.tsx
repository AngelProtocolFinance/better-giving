import type { CSSProperties } from "react";

const rights = [
  {
    num: "01",
    title: "Financial self-sufficiency",
    body: "Grow durable reserves and access the tools of long-term stability, not perpetual dependence on the next grant cycle.",
  },
  {
    num: "02",
    title: "Equal opportunity",
    body: "Fair access to modern fundraising and finance, regardless of size, location, or cause.",
  },
  {
    num: "03",
    title: "Organizational autonomy",
    body: "Independence to allocate funds and reduce admin drag on your terms, with no lock-in, ever.",
  },
] as const;

interface IManifesto {
  classes?: string;
}

export function Manifesto({ classes = "" }: IManifesto) {
  return (
    <section className={classes} aria-labelledby="manifesto-heading">
      <div className="page">
        <div className="reveal grid justify-items-center text-center">
          <p className="eyebrow text-primary">The Better Giving Manifesto</p>
          <h2 id="manifesto-heading" className="section-heading mt-4 max-w-2xl">
            Every nonprofit has <em className="text-primary">three rights</em>
          </h2>
        </div>
        <ol className="mt-14 md:mt-20 grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x">
          {rights.map((r, i) => (
            <li
              key={r.num}
              className="reveal grid content-start gap-4 py-10 first:pt-0 last:pb-0 md:py-0 md:px-10 md:first:pl-0 md:last:pr-0"
              style={{ "--reveal-order": i } as CSSProperties}
            >
              <span
                className="display-figure text-6xl md:text-7xl text-primary"
                aria-hidden
              >
                {r.num}
              </span>
              <h3 className="subsection-heading mt-2">{r.title}</h3>
              <p className="text-base/relaxed text-gray-11 text-pretty">
                {r.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
