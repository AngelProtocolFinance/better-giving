import { type CSSProperties, memo, type ReactNode, useId, useRef } from "react";
import { FormReplica } from "./form-replica";
import { Laira } from "./laira";
import { frame_of, type IFrame } from "./progress";
import { use_tour } from "./use-tour";

/** the form's two tenant accent slots (`--form-primary`/`--form-secondary`,
 *  as `components/donation/container.tsx` sets them), brand blue first, each
 *  pair a ramp's fill step and its tint. `--secondary` follows the tint so the
 *  `tile` the form sits on takes the brand too. */
const ACCENTS = [
  { primary: "var(--blue-9)", secondary: "var(--blue-3)" },
  { primary: "var(--green-9)", secondary: "var(--green-3)" },
  { primary: "var(--red-9)", secondary: "var(--red-3)" },
];

/* chapter copy is the site's own, verbatim: headings and lines from
   `_app.product/gift-types.tsx`, `_app.product/features.tsx`,
   `_landing._index/pillars.tsx` and `_landing._index/steps.tsx`. */
const CHAPTERS = [
  {
    title: "Every way to give, in one flow",
    body: "Card, bank, PayPal, wallets, stock, DAF, IRA, and crypto. One flow, one integration, no extra portals.",
    // below xl there is no scroll scrub, so each chapter shows one moment of it
    still: frame_of({ chapter: 1, progress: 0.6 }),
  },
  {
    title: "Customizable & embeddable",
    body: "Your brand colors, your wording, on your website.",
    still: frame_of({ chapter: 2, progress: 0.5 }),
  },
  {
    title: "Keep more of every dollar",
    body: "No platform fee while the optional donor contribution stays on your form. It is opt-in and starts off.",
    still: frame_of({ chapter: 3, progress: 1 }),
  },
  {
    title: "Recurring donations",
    body: "Stabilize revenue with automated monthly giving. Fewer clicks and express checkout mean more completed gifts and monthly donors.",
    still: frame_of({ chapter: 4, progress: 0 }),
  },
];

const HERO_STILL = frame_of({ chapter: 0, progress: 0 });

interface ITourFrame {
  frame: IFrame;
  /** the sticky, scroll-driven stage rather than one chapter's still */
  live: boolean;
  reduced: boolean;
  classes?: string;
}

const same_frame = (a: ITourFrame, b: ITourFrame) =>
  a.live === b.live &&
  a.reduced === b.reduced &&
  a.classes === b.classes &&
  (Object.keys(a.frame) as (keyof IFrame)[]).every(
    (k) => a.frame[k] === b.frame[k]
  );

/** the form on its tile with Laira beside it. an illustration: the chapter
 *  text carries the content, so the whole frame is hidden from assistive tech
 *  and out of the tab order. */
const TourFrame = memo(function TourFrame({
  frame,
  live,
  reduced,
  classes = "",
}: ITourFrame) {
  const accent = ACCENTS[frame.accent];
  const style = {
    "--form-primary": accent.primary,
    "--form-secondary": accent.secondary,
    "--secondary": accent.secondary,
  } as CSSProperties;
  return (
    <div
      aria-hidden="true"
      inert
      style={style}
      className={`${classes} tile relative transition-colors`}
    >
      <FormReplica frame={frame} live={live} reduced={reduced} />
      {/* on the thank-you she is inside the form, cheering */}
      {frame.view === "form" && (
        <Laira
          pose={frame.pose}
          live={live}
          reduced={reduced}
          classes={
            live
              ? "absolute -bottom-4 -start-12 h-40"
              : "absolute -top-16 end-4 h-24"
          }
        />
      )}
    </div>
  );
}, same_frame);

interface IFormTour {
  /** chapter 0: the hero's own text, unchanged */
  intro: ReactNode;
  classes?: string;
}

/** the hero scrolled through a donation. xl+: the chapters run down the left
 *  while the form stays pinned on the right and advances with them. below xl
 *  nothing pins; each chapter is followed by its own still of the form. */
export function FormTour({ intro, classes = "" }: IFormTour) {
  const root = useRef<HTMLDivElement>(null);
  const tour = use_tour(root);
  const id = useId();

  return (
    <div
      ref={root}
      className={`${classes} page grid xl:grid-cols-[5fr_6fr] xl:gap-x-12`}
    >
      <div className="grid">
        <div
          data-tour-chapter
          className="grid content-center xl:min-h-[calc(100svh-4rem)]"
        >
          {intro}
          <TourFrame
            frame={HERO_STILL}
            live={false}
            reduced={tour.reduced}
            classes="xl:hidden mt-28 max-w-2xl"
          />
        </div>
        {CHAPTERS.map((c, i) => (
          <section
            key={c.title}
            data-tour-chapter
            aria-labelledby={`${id}-${i}`}
            // the last one is a full viewport tall: while its text sits at the
            // centre line, the column still runs past the stage's foot, so the
            // stage stays pinned instead of riding up with the column's end
            className={`grid content-center pt-24 xl:pt-0 ${
              i === CHAPTERS.length - 1 ? "xl:min-h-svh" : "xl:min-h-[85svh]"
            }`}
          >
            <div className="grid gap-5">
              <h2 id={`${id}-${i}`} className="section-heading">
                {c.title}
              </h2>
              <p className="text-lg/relaxed text-gray-11 text-pretty max-w-xl">
                {c.body}
              </p>
            </div>
            <TourFrame
              frame={c.still}
              live={false}
              reduced={tour.reduced}
              // capped so the 487px wallet image never upscales; Laira peeks over
              // a form still, and the thank-you holds her inside
              classes={`xl:hidden max-w-2xl ${c.still.view === "thanks" ? "mt-12" : "mt-28"}`}
            />
          </section>
        ))}
      </div>
      <div className="max-xl:hidden">
        <div className="sticky top-16 grid content-center min-h-[calc(100svh-4rem)] py-2">
          <TourFrame frame={frame_of(tour)} live reduced={tour.reduced} />
        </div>
      </div>
    </div>
  );
}
