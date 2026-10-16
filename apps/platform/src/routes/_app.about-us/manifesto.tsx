import type { CSSProperties } from "react";

const rights = [
  {
    title: "Financial self-sufficiency",
    body: "Grow durable reserves and access the tools of long-term stability, not perpetual dependence on the next grant cycle.",
  },
  {
    title: "Equal opportunity",
    body: "Fair access to modern fundraising and finance, regardless of size, location, or cause.",
  },
  {
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
        <h2 id="manifesto-heading" className="section-heading max-w-2xl reveal">
          Every nonprofit has three rights
        </h2>
        <ol className="mt-14 md:mt-20 grid gap-12 md:grid-cols-3 md:gap-12 lg:gap-16">
          {rights.map((r, i) => (
            <li
              key={r.title}
              className="reveal grid content-start gap-4"
              style={{ "--reveal-order": i } as CSSProperties}
            >
              <h3 className="subsection-heading">{r.title}</h3>
              <p className="text-lg/relaxed text-gray-11 text-pretty">
                {r.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
