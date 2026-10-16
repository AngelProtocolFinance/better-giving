import { EMAILS } from "@better-giving/brand";
import type { CSSProperties } from "react";

const promises = [
  {
    n: "01",
    title: "Your data belongs to you",
    body: "Every record, full giving history, exportable anytime via CSV or API, free.",
  },
  {
    n: "02",
    title: "Recurring donors are portable",
    body: "We actively facilitate migrating recurring-donor payment records to your new processor.",
  },
  {
    n: "03",
    title: "No exit toll",
    body: "Never conditioned on fees or new terms. Data in 5 business days, migration underway in 10.",
  },
  {
    n: "04",
    title: "Or own it from day one",
    body: "Self-host the open-source form with your own gateway: your tokens never leave your control.",
  },
] as const;

interface IPortability {
  classes?: string;
}

export function Portability({ classes = "" }: IPortability) {
  return (
    <section className={classes} aria-labelledby="portability-heading">
      <div className="page">
        <div className="grid justify-items-center text-center reveal">
          <p className="eyebrow text-primary">No lock-in</p>
          <h2
            id="portability-heading"
            className="section-heading mt-4 max-w-3xl"
          >
            Your donors are yours,{" "}
            <em className="text-primary">including your recurring donors</em>
          </h2>
          <p className="mt-5 text-lg/relaxed text-gray-11 max-w-2xl text-pretty">
            Most platforms let you export a spreadsheet, but hold your monthly
            card-on-file donors hostage. We make the opposite promise, the{" "}
            <strong className="text-gray-12">
              Recurring-Donor Portability Guarantee
            </strong>
            :
          </p>
        </div>

        <ol className="grid gap-12 lg:grid-cols-4 lg:gap-8 mt-16 md:mt-20 max-w-xl mx-auto lg:max-w-none">
          {promises.map((p, i) => (
            <li
              key={p.n}
              className="reveal relative grid content-start grid-cols-[auto_1fr] gap-x-6 lg:grid-cols-1"
              style={{ "--reveal-order": i } as CSSProperties}
            >
              {/* the connector to the next promise: down the medallion column
                  below lg, across to the next medallion at lg. the medallion's
                  own fill hides the end that runs under it */}
              {i < promises.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute left-8 top-8 -bottom-12 border-l-2 border-dashed border-gray-7 lg:left-10 lg:top-10 lg:bottom-auto lg:-right-8 lg:border-l-0 lg:border-t-2"
                />
              )}
              <span className="relative row-span-2 lg:row-span-1 flex-center size-16 lg:size-20 rounded-full border bg-surface display-figure text-3xl lg:text-4xl text-primary">
                {p.n}
              </span>
              <h3 className="text-lg font-bold text-gray-12 text-balance self-center lg:self-auto lg:mt-6">
                {p.title}
              </h3>
              <p className="mt-2 text-base/relaxed text-gray-11 text-pretty lg:max-w-64">
                {p.body}
              </p>
            </li>
          ))}
        </ol>

        <p className="card mt-16 md:mt-20 max-w-3xl mx-auto text-sm/relaxed text-gray-11 text-pretty">
          <strong className="text-gray-12">Honest fine print:</strong> whether a
          stored card credential can transfer directly depends on card-network
          rules, PCI-DSS, and your new processor. Where a direct transfer isn't
          permitted, we hand over the full recurring-gift schedule and support a
          re-authorization campaign. We will never be the obstacle. Invoke it
          anytime:{" "}
          <a href={`mailto:${EMAILS.support}`} className="font-bold link">
            {EMAILS.support}
          </a>
        </p>
      </div>
    </section>
  );
}
