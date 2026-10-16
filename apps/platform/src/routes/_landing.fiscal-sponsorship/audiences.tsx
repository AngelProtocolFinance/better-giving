import { Earth, type LucideIcon, Sprout } from "lucide-react";
import type { CSSProperties } from "react";
import map from "#/assets/images/map.webp";

interface IAudience {
  title: string;
  body: string;
  Icon: LucideIcon;
  /** the world map behind the card: the abroad audience's own picture */
  global: boolean;
}

const audiences: IAudience[] = [
  {
    title: "Organizations outside the U.S.",
    body: "Grassroots and established nonprofits abroad often can't access IRS tax-exempt status, which shuts them out of U.S. donors and foundation grants. We bridge that gap: your U.S. supporters give tax-deductibly, we handle the legal and tax complexity, and grant the funds to you.",
    Icon: Earth,
    global: true,
  },
  {
    title: "U.S. groups without a 501(c)(3)",
    body: "New projects and community initiatives can start accepting tax-deductible donations right away: no incorporation, no year-long IRS wait. When you're ready to stand on your own, your donors and data go with you.",
    Icon: Sprout,
    global: false,
  },
];

interface IAudiences {
  classes?: string;
}

export function Audiences({ classes = "" }: IAudiences) {
  return (
    <section className={classes} aria-labelledby="audiences-heading">
      <div className="page">
        <h2
          id="audiences-heading"
          className="section-heading text-center max-w-2xl mx-auto reveal"
        >
          Who fiscal sponsorship is for
        </h2>
        <ul className="grid gap-6 md:grid-cols-2 mt-12 md:mt-16">
          {audiences.map(({ title, body, Icon, global }, i) => (
            <li
              key={title}
              className="card reveal relative isolate overflow-hidden grid gap-5 content-start"
              style={{ "--reveal-order": i } as CSSProperties}
            >
              {global ? <MapArt /> : null}
              <span
                aria-hidden="true"
                className="size-12 rounded-full bg-secondary text-primary grid place-items-center"
              >
                <Icon className="icon-2xl" />
              </span>
              <div className="grid gap-2.5">
                <h3 className="text-xl font-bold text-gray-12 text-balance">
                  {title}
                </h3>
                <p className="text-base/relaxed text-gray-11 text-pretty">
                  {body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** the dotted world map as a primary-tinted mask over the card's top, behind
 *  the medallion: the asset is black at ≤20% alpha, so the mask caps the fill
 *  at that strength and the dots read as a wash, never as ink under the copy */
function MapArt() {
  return (
    <div
      className="absolute inset-x-0 top-0 h-40 -z-10 bg-primary"
      style={{
        maskImage: `url(${map})`,
        maskSize: "contain",
        maskPosition: "right top",
        maskRepeat: "no-repeat",
      }}
      aria-hidden
    />
  );
}
