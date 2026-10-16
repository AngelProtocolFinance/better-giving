import { Image } from "@better-giving/ui";
import laira_shake_hands_x2 from "#/assets/laira/laira-shaking-hands-x2.webp";

interface IFee {
  /** the ground comes from here — the inks below are `surface-deep`'s set */
  classes?: string;
}

export function Fee({ classes = "" }: IFee) {
  return (
    <section
      className={`${classes} relative isolate overflow-hidden`}
      aria-labelledby="fee-heading"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 dot-grid dot-grid-fade"
      />
      <div className="page grid gap-14 lg:gap-20 lg:grid-cols-[0.9fr_1.1fr] items-center">
        <div className="grid gap-5 reveal lg:col-start-2">
          <p className="eyebrow text-amber-6">The fee</p>
          <h2 id="fee-heading" className="section-heading max-w-xl">
            <em className="text-amber-6">2.9%</em>, the lowest sponsorship fee
            we know of
          </h2>
          <p className="text-blue-5 text-lg/relaxed md:text-xl/relaxed text-pretty max-w-xl">
            Typical fiscal sponsors charge 4-10%. Ours covers the real costs of
            compliance and granting, and we're working to make it
            donor-coverable, so you'd keep 100%.
          </p>
        </div>
        <span className="relative grid place-items-center justify-self-center lg:col-start-1 lg:row-start-1">
          {/* the same halo the cta band spends behind its Laira */}
          <span
            className="absolute size-72 lg:size-96 max-w-full bg-radial from-blue-8 to-transparent to-60%"
            aria-hidden="true"
          />
          <Image
            src={laira_shake_hands_x2}
            width={420}
            alt="Two Lairas shaking hands"
            className="relative w-64 md:w-80 lg:w-96 h-auto"
          />
        </span>
      </div>
    </section>
  );
}
