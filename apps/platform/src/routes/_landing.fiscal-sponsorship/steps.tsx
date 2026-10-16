import type { CSSProperties } from "react";

const steps = [
  {
    title: "Register your organization",
    body: "Apply in minutes. We review and confirm your eligibility right away.",
  },
  {
    title: "We receive gifts on your behalf",
    body: "Donors give through your branded form (every gift type) with automatic U.S. tax receipts.",
  },
  {
    title: "We grant funds to you",
    body: "Electronic payouts within 5 working days, or grow a share in savings and the Sustainability Fund.",
  },
] as const;

interface ISteps {
  classes?: string;
}

export function Steps({ classes = "" }: ISteps) {
  return (
    <section className={classes} aria-labelledby="steps-heading">
      <div className="page">
        <h2 id="steps-heading" className="section-heading max-w-2xl reveal">
          How it works
        </h2>
        {/* order is the row's left-to-right and the list's own numbering */}
        <ol className="mt-14 md:mt-16 grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <li
              key={s.title}
              className="tile reveal grid content-start gap-3"
              style={{ "--reveal-order": i } as CSSProperties}
            >
              <h3 className="subsection-heading">{s.title}</h3>
              <p className="text-base/relaxed text-gray-11 text-pretty">
                {s.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
