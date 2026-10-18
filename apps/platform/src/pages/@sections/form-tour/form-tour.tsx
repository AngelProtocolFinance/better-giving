import {
  type CSSProperties,
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { type IFit, stage_fit } from "./fit";
import { FormReplica } from "./form-replica";
import { Laira, preload_poses } from "./laira";
import { frame_of, type IFrame } from "./progress";
import { use_before_paint, use_tour } from "./use-tour";

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

const XL = "(min-width: 80rem)";

/** `css`: the server's render and hydration, where the breakpoints decide;
 *  `measure`: the stage mounted for one pre-paint layout pass to size it;
 *  `pin`: pinned, scaled to fit; `stills`: no pin, each chapter its still. */
type TMode =
  | { kind: "css" }
  | { kind: "measure" }
  | { kind: "pin"; fit: IFit }
  | { kind: "stills" };

/** the hero scrolled through a donation. on a desktop the stage fits (xl+,
 *  and tall enough at `MIN_SCALE`): the chapters run down the left while the
 *  form stays pinned on the right and advances with them. otherwise nothing
 *  pins and each chapter is followed by its own still of the form. */
export function FormTour({ intro, classes = "" }: IFormTour) {
  const root = useRef<HTMLDivElement>(null);
  const column = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [mode, set_mode] = useState<TMode>({ kind: "css" });
  const tour = use_tour(root, mode.kind);

  // the stage's unscaled height against the viewport, read before paint so
  // neither a mis-sized stage nor the wrong arrangement is ever shown
  const decide = useCallback(() => {
    if (!window.matchMedia(XL).matches) return set_mode({ kind: "stills" });
    const col = column.current;
    const el = stage.current;
    if (!col || !el) return set_mode({ kind: "measure" });
    const fit = stage_fit(
      el.offsetHeight,
      window.innerHeight,
      col.getBoundingClientRect().top + window.scrollY
    );
    set_mode(fit ? { kind: "pin", fit } : { kind: "stills" });
  }, []);

  use_before_paint(() => {
    decide();
    let raf = 0;
    const on_resize = () => {
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          decide();
        });
    };
    window.addEventListener("resize", on_resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", on_resize);
    };
  }, [decide]);

  use_before_paint(() => {
    if (mode.kind === "measure") decide();
  }, [mode.kind, decide]);

  const pinned = mode.kind === "pin";
  useEffect(() => {
    if (pinned) preload_poses();
  }, [pinned]);

  // every layout but `stills` is the pinned arrangement, gated at xl by css
  const two_col = mode.kind !== "stills";
  const still = two_col ? "xl:hidden max-w-2xl" : "max-w-2xl";

  return (
    <div
      ref={root}
      className={`${classes} page grid ${
        two_col ? "xl:grid-cols-[5fr_6fr] xl:gap-x-12" : ""
      }`}
    >
      <div className="grid">
        <div
          data-tour-chapter
          className={`grid content-center ${
            two_col ? "xl:min-h-[calc(100svh-4rem)]" : ""
          }`}
        >
          {intro}
          <TourFrame
            frame={HERO_STILL}
            live={false}
            reduced={tour.reduced}
            classes={`${still} mt-28`}
          />
        </div>
        {CHAPTERS.map((c, i) => (
          <div
            key={c.title}
            data-tour-chapter
            // the last one is a full viewport tall: while its text sits at the
            // centre line, the column still runs past the stage's foot, so the
            // stage stays pinned instead of riding up with the column's end
            className={`grid content-center pt-24 ${
              !two_col
                ? ""
                : i === CHAPTERS.length - 1
                  ? "xl:pt-0 xl:min-h-svh"
                  : "xl:pt-0 xl:min-h-[85svh]"
            }`}
          >
            <div className="grid gap-5">
              <h2 className="section-heading">{c.title}</h2>
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
              classes={`${still} ${c.still.view === "thanks" ? "mt-12" : "mt-28"}`}
            />
          </div>
        ))}
      </div>
      {two_col && (
        <div ref={column} className="max-xl:hidden">
          <div className="sticky top-16 h-[calc(100svh-4rem)]">
            {/* held invisible until it is sized and has read the scroll, so a
                load or reload never paints the server's frame 0 mid-tour.
                `pb-4` keeps Laira's overhang (`-bottom-4`) in the measured box */}
            <div
              ref={stage}
              style={
                pinned
                  ? {
                      transform: `translateY(${mode.fit.offset}px) scale(${mode.fit.scale})`,
                    }
                  : undefined
              }
              className={`origin-top pb-4 transition-opacity duration-base ${
                pinned ? "opacity-100" : "opacity-0"
              }`}
            >
              <TourFrame frame={frame_of(tour)} live reduced={tour.reduced} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
