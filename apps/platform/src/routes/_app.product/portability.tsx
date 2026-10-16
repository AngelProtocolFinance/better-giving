import { EMAILS } from "@better-giving/brand";
import type { CSSProperties } from "react";

const promises = [
  {
    title: "Your data belongs to you",
    body: "Every record, full giving history, exportable anytime via CSV or API, free.",
  },
  {
    title: "Recurring donors are portable",
    body: "We actively facilitate migrating recurring-donor payment records to your new processor.",
  },
  {
    title: "No exit toll",
    body: "Never conditioned on fees or new terms. Data in 5 business days, migration underway in 10.",
  },
  {
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
        <div className="grid gap-5 max-w-3xl reveal">
          <h2 id="portability-heading" className="section-heading">
            Your donors are yours, including your recurring donors
          </h2>
          <p className="text-lg/relaxed text-gray-11 text-pretty">
            Most platforms let you export a spreadsheet, but hold your monthly
            card-on-file donors hostage. We make the opposite promise, the{" "}
            <strong className="text-gray-12">
              Recurring-Donor Portability Guarantee
            </strong>
            :
          </p>
        </div>

        <ol className="grid gap-5 md:grid-cols-2 lg:grid-cols-4 mt-12 md:mt-16">
          {promises.map((p, i) => (
            <li
              key={p.title}
              className="tile reveal grid content-start gap-3"
              style={{ "--reveal-order": i } as CSSProperties}
            >
              <h3 className="text-xl font-bold text-gray-12 text-balance">
                {p.title}
              </h3>
              <p className="text-base/relaxed text-gray-11 text-pretty">
                {p.body}
              </p>
            </li>
          ))}
        </ol>

        <p className="mt-12 md:mt-16 max-w-3xl text-sm/relaxed text-gray-11 text-pretty">
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
