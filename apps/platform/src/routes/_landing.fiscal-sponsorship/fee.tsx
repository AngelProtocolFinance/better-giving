import { Image } from "@better-giving/ui";
import laira_shake_hands_x2 from "#/assets/laira/laira-shaking-hands-x2.webp";

interface IFee {
  /** the ground comes from here — the inks below are `surface-deep`'s set */
  classes?: string;
}

export function Fee({ classes = "" }: IFee) {
  return (
    <section className={classes} aria-labelledby="fee-heading">
      <div className="page grid gap-14 lg:gap-20 lg:grid-cols-[0.9fr_1.1fr] items-center">
        <div className="grid gap-5 reveal lg:col-start-2">
          <h2 id="fee-heading" className="section-heading max-w-xl">
            2.9%, the lowest sponsorship fee we know of
          </h2>
          <p className="text-blue-5 text-lg/relaxed md:text-xl/relaxed text-pretty max-w-xl">
            Typical fiscal sponsors charge 4-10%. Ours covers the real costs of
            compliance and granting, and we're working to make it
            donor-coverable, so you'd keep 100%.
          </p>
        </div>
        <Image
          src={laira_shake_hands_x2}
          width={420}
          alt=""
          className="w-64 md:w-80 lg:w-96 h-auto justify-self-center lg:col-start-1 lg:row-start-1"
        />
      </div>
    </section>
  );
}
