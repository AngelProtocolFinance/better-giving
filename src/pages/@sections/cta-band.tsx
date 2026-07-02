import { href, Link } from "react-router";
import laira_cheering from "#/assets/laira/laira-cheering.webp";
import { ExtLink } from "#/components/ext-link";
import { Image } from "#/components/image";
import { BOOK_A_DEMO } from "#/constants/urls";

interface ICtaBand {
  title: string;
  subtitle: string;
  classes?: string;
}

export function CtaBand({ title, subtitle, classes = "" }: ICtaBand) {
  return (
    <section
      className={`${classes} relative overflow-hidden bg-primary px-6 py-20 text-center`}
    >
      <Image
        src={laira_cheering}
        width={140}
        alt="Laira celebrating"
        className="mx-auto mb-4"
      />
      <h2 className="section-heading text-primary-fg max-w-2xl mx-auto">
        {title}
      </h2>
      <p className="mt-4 text-lg text-primary-fg/80 max-w-xl mx-auto text-pretty">
        {subtitle}
      </p>
      <div className="flex flex-wrap justify-center gap-3.5 mt-8">
        <Link
          to={href("/register/welcome")}
          className="btn btn-secondary px-7 py-3.5"
        >
          Join free forever
        </Link>
        <ExtLink
          href={BOOK_A_DEMO}
          className="btn px-7 py-3.5 border-2 border-primary-fg/40 text-primary-fg hover:bg-primary-fg/10"
        >
          Book a demo
        </ExtLink>
      </div>
    </section>
  );
}
