import laira_pulling_woman_up from "#/assets/images/laira-pulling-woman-up.webp";
import { Image } from "#/components/image";
import { app_name } from "#/constants/env";

interface IUnderdogLetter {
  classes?: string;
}

export function UnderdogLetter({ classes = "" }: IUnderdogLetter) {
  return (
    <section className={classes} aria-labelledby="underdog-heading">
      <div className="max-w-6xl mx-auto grid gap-14 lg:grid-cols-[1.05fr_0.95fr] items-center">
        <div className="grid gap-4">
          <h2 id="underdog-heading" className="section-heading">
            We're not the biggest platform. So we try harder.
          </h2>
          <p className="text-muted-fg leading-relaxed text-pretty">
            When you're a fellow nonprofit, you have to. We can't afford
            confusing checkouts, hidden platform fees, or charging for gated
            features.
          </p>
          <p className="text-muted-fg leading-relaxed text-pretty">
            So we help you raise more with a conversion-optimized donation flow.
            We help you grow more by accepting larger gift types and putting
            donations to work. We help you do more by handling the admin so you
            can focus on your mission. And we never take a cut, anywhere.
          </p>
          <p className="leading-relaxed text-pretty">
            <strong>
              Why? Because we can't afford to take you for granted.
            </strong>{" "}
            At {app_name} you're not another customer. You're a trusted member.
          </p>
        </div>
        <Image
          src={laira_pulling_woman_up}
          width={728}
          height={607}
          alt="Laira helping someone climb up"
          className="w-full max-w-md justify-self-center"
        />
      </div>
    </section>
  );
}
