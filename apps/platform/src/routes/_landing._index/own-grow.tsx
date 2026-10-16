import { CodeXml } from "lucide-react";
import type { CSSProperties } from "react";

interface IOwnGrow {
  classes?: string;
}

export function OwnGrow({ classes = "" }: IOwnGrow) {
  return (
    <section className={classes} aria-labelledby="own-grow-heading">
      <div className="page">
        <div className="reveal grid gap-5 max-w-3xl">
          <h2 id="own-grow-heading" className="section-heading">
            Own it. Grow it.
          </h2>
          <p className="section-body text-gray-11">
            Most platforms move your money and keep the keys. We built the
            opposite: infrastructure you can own, and reserves that grow.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 mt-14 md:mt-16">
          <div
            className="reveal rounded surface-deep p-8 md:p-10 grid content-start gap-5"
            style={{ "--reveal-order": 0 } as CSSProperties}
          >
            {/* the mark is centred on the heading's line and out of flow, so
                both panels' headings and copy stay on one baseline */}
            <div className="relative">
              <h3 className="subsection-heading">Own it.</h3>
              <CodeXml
                aria-hidden="true"
                className="absolute inset-e-0 top-1/2 -translate-y-1/2 icon-2xl text-amber-6"
              />
            </div>
            <p className="text-base/relaxed md:text-lg/relaxed text-blue-5 text-pretty">
              Our whole stack is open source: trust you can verify in code, not
              just promises. You own the donor relationship, your data exports
              freely, and if you ever want full independence, you can self-host
              the donation form and own your own gateway. And there's no
              lock-in, including your recurring donors: our{" "}
              <strong className="text-primary-fg">
                Recurring-Donor Portability Guarantee
              </strong>{" "}
              means if you ever leave, we actively help migrate your recurring
              donors to your new platform, free, no exit toll.
            </p>
          </div>
          <div
            className="reveal rounded bg-mint text-gray-12 p-8 md:p-10 grid grid-rows-[auto_auto_1fr] gap-5"
            style={{ "--reveal-order": 1 } as CSSProperties}
          >
            <h3 className="subsection-heading">Grow it.</h3>
            <p className="text-base/relaxed md:text-lg/relaxed text-pretty">
              We don't just move money. We help you keep and grow it. Route any
              share of what you raise into FDIC-insured savings (~3-4%) or a
              professionally managed Sustainability Fund, and turn this
              quarter's gifts into next decade's reserves. No setup, AUM, or
              performance fees.
            </p>
            <GrowthCurve />
          </div>
        </div>
      </div>
    </section>
  );
}

/** a rising reserve, drawn from tokens. no axis and no figures: it pictures the
 *  idea, it does not chart a return */
function GrowthCurve() {
  const line = "M8 70C72 67 112 60 156 48S244 19 312 9";
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 320 80"
      className="self-end w-full h-auto overflow-visible"
    >
      <path d={`${line}L312 80L8 80Z`} className="fill-secondary" />
      <path
        d={line}
        className="fill-none stroke-primary [stroke-width:3] [stroke-linecap:round]"
      />
      <circle
        cx="312"
        cy="9"
        r="6"
        className="fill-surface stroke-primary [stroke-width:3]"
      />
    </svg>
  );
}
