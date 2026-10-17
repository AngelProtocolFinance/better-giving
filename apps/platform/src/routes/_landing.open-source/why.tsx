import type { CSSProperties } from "react";

const reasons = [
  {
    title: "Verify, don't trust",
    body: "Anyone (your board, your auditor, your most skeptical donor) can inspect exactly how donations are processed, routed, and receipted.",
  },
  {
    title: "Read it, then contribute",
    body: "The repository is the managed platform: the donation form, settlement, and receipts. Reading it is how you check the path a gift takes. Contributions of code, docs, and review are welcome.",
  },
  {
    title: "A commons that outlives us",
    body: "Public code can't be bought, gated, or shut away. The community keeps the infrastructure free for every nonprofit, forever.",
  },
] as const;

interface IWhy {
  classes?: string;
}

export function Why({ classes = "" }: IWhy) {
  return (
    <section className={classes} aria-labelledby="why-heading">
      <div className="page grid gap-14 lg:gap-24 lg:grid-cols-[5fr_7fr]">
        <h2 id="why-heading" className="section-heading max-w-md reveal">
          Why an open-source commons?
        </h2>
        <ul className="grid gap-12">
          {reasons.map(({ title, body }, i) => (
            <li
              key={title}
              className="reveal grid content-start gap-3 max-w-2xl"
              style={{ "--reveal-order": i } as CSSProperties}
            >
              <h3 className="subsection-heading">{title}</h3>
              <p className="text-lg/relaxed text-gray-11 text-pretty">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
