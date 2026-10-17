import { EMAILS } from "@better-giving/brand";
import { Image } from "@better-giving/ui";
import { ArrowRight } from "lucide-react";
import laira_cheering from "#/assets/laira/laira-cheering.webp";

interface IVolunteer {
  classes?: string;
}

export function Volunteer({ classes = "" }: IVolunteer) {
  return (
    <section className={classes} aria-labelledby="volunteer-heading">
      <div className="page grid gap-14 lg:gap-20 lg:grid-cols-[0.9fr_1.1fr] items-center">
        <div className="relative isolate grid place-items-center max-lg:order-2">
          <span
            className="absolute -z-10 size-64 md:size-80 rounded-full bg-band"
            aria-hidden
          />
          <Image
            src={laira_cheering}
            width={340}
            alt=""
            className="w-56 md:w-72 h-auto"
          />
        </div>
        <div className="grid justify-items-start max-w-prose">
          <h2 id="volunteer-heading" className="section-heading reveal">
            Lend your skills
          </h2>
          <p className="mt-8 text-lg/relaxed text-gray-11 text-pretty">
            Want to help with code, design, writing, or nonprofit expertise?
            We'd love to have you.
          </p>
          <a
            href={`mailto:${EMAILS.support}`}
            className="mt-8 inline-flex items-center gap-1.5 text-lg font-bold link"
          >
            Get in touch
            <ArrowRight className="icon-md" />
          </a>
        </div>
      </div>
    </section>
  );
}
