import { Image } from "@better-giving/ui";
import laira_shaking_hands from "#/assets/laira/laira-shaking-hands.webp";

interface IPortability {
  classes?: string;
}

export function Portability({ classes = "" }: IPortability) {
  return (
    <section className={classes} aria-labelledby="portability-heading">
      <div className="max-w-3xl mx-auto grid justify-items-center text-center">
        <Image
          src={laira_shaking_hands}
          width={140}
          alt="Better Giving and a partner nonprofit shaking hands"
          className="mb-5"
        />
        <h2 id="portability-heading" className="article-heading">
          Your donor records leave with you
        </h2>
        <p className="mt-3 text-lg text-gray-11 text-pretty">
          If you leave, you can export your donation records. We do not transfer
          stored card credentials to another processor. A donor who wants to
          keep giving authorizes a new gift with the new provider.
        </p>
      </div>
    </section>
  );
}
