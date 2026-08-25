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
          The recurring-donor portability guarantee
        </h2>
        <p className="mt-3 text-lg text-gray-11 text-pretty">
          If you ever leave, your recurring donors leave with you:
          subscriptions, data, everything. We never hold nonprofits captive.
          Partnership means you stay because you want to, not because switching
          hurts.
        </p>
      </div>
    </section>
  );
}
