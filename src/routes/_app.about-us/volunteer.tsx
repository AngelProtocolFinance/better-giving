import { ArrowRight } from "lucide-react";
import laira_cheering from "#/assets/laira/laira-cheering.webp";
import { Image } from "#/components/image";

interface IVolunteer {
  classes?: string;
}

export function Volunteer({ classes = "" }: IVolunteer) {
  return (
    <section className={classes} aria-labelledby="volunteer-heading">
      <div className="max-w-6xl mx-auto grid gap-14 lg:grid-cols-[0.95fr_1.05fr] items-center">
        <Image
          src={laira_cheering}
          width={340}
          alt="Laira celebrating"
          className="w-full max-w-xs justify-self-center max-lg:order-2"
        />
        <div className="grid gap-4 justify-items-start">
          <p className="text-xs font-bold uppercase tracking-wider text-primary">
            Who runs this?
          </p>
          <h2 id="volunteer-heading" className="section-heading">
            Volunteers. No investors. No salaries to protect.
          </h2>
          <p className="text-muted-fg leading-relaxed text-pretty">
            Better Giving is run by volunteers from across the nonprofit and
            technology worlds, people who build, maintain, and support the
            commons because they believe nonprofits deserve better financial
            infrastructure. There's no venture capital to satisfy and no revenue
            target to hit, which is exactly why we can promise free forever and
            mean it.
          </p>
          <p className="text-muted-fg leading-relaxed text-pretty">
            Want to lend your skills (code, design, writing, nonprofit
            expertise)? We'd love to have you.
          </p>
          <a
            href="mailto:support@better.giving"
            className="inline-flex items-center gap-1.5 font-bold text-primary hover:underline"
          >
            Volunteer with us
            <ArrowRight className="size-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
