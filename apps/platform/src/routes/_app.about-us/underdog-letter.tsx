import { Image } from "@better-giving/ui";
import laira_pulling_woman_up from "#/assets/images/laira-pulling-woman-up.webp";
import { app_name } from "#/constants/env";

interface IUnderdogLetter {
  classes?: string;
}

export function UnderdogLetter({ classes = "" }: IUnderdogLetter) {
  return (
    <section className={classes} aria-labelledby="underdog-heading">
      <div className="page grid gap-14 lg:gap-20 lg:grid-cols-2 items-center">
        <div className="max-w-prose">
          <h2 id="underdog-heading" className="section-heading reveal">
            We're not the biggest platform. So we try harder.
          </h2>
          <div className="mt-8 grid gap-5 text-lg/relaxed text-gray-11 text-pretty">
            <p>
              When you're a fellow nonprofit, you have to. We can't afford
              confusing checkouts, hidden platform fees, or charging for gated
              features.
            </p>
            <p>
              So we help you raise more with a conversion-optimized donation
              flow. We help you grow more by accepting larger gift types and
              putting donations to work. We help you do more by handling the
              admin so you can focus on your mission. And we never take a cut,
              anywhere.
            </p>
          </div>
          <p className="tile mt-10 text-xl/relaxed text-gray-12 text-pretty">
            <strong className="font-bold">
              Why? Because we can't afford to take you for granted.
            </strong>{" "}
            At {app_name} you're not another customer. You're a trusted member.
          </p>
        </div>
        {/* the art ships its own shaped edge, so it takes no box */}
        <div className="reveal justify-self-center w-full max-w-xl">
          <Image
            src={laira_pulling_woman_up}
            width={728}
            height={607}
            alt="Laira helping someone climb up"
            className="w-full h-auto"
          />
        </div>
      </div>
    </section>
  );
}
