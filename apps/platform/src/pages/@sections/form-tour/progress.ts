import type { DonateMethodId } from "@/npo";

/** the tab order the real form renders (`all_method_ids` in
 *  `components/donation/common/constants.ts`), which is also frame 0's sidebar */
export const METHODS = [
  "stripe",
  "stripe_bank",
  "daf",
  "stocks",
  "ira_qcd",
  "crypto",
] as const satisfies readonly DonateMethodId[];

export type TMethod = (typeof METHODS)[number];

export type TPose =
  | "gift"
  | "heart"
  | "note"
  | "pointing"
  | "trophy"
  | "coin"
  | "announce"
  | "like"
  | "cheering";

/** Laira carries the prop that matches the gift type */
const METHOD_POSE: Record<TMethod, TPose> = {
  stripe: "gift",
  stripe_bank: "heart",
  daf: "note",
  stocks: "pointing",
  ira_qcd: "trophy",
  crypto: "coin",
};

/** brand, then two tenant accents; indexes into `ACCENTS` in `form-tour.tsx` */
export const ACCENT_COUNT = 3;

export interface IBox {
  /** viewport-relative, as `getBoundingClientRect` reads it */
  top: number;
  height: number;
}

export interface ITourPos {
  chapter: number;
  /** 0..1 through the chapter's own height */
  progress: number;
}

export interface IFrame {
  view: "form" | "thanks";
  method: TMethod;
  frequency: "one-time" | "monthly";
  amount: string;
  accent: number;
  tip: "hidden" | "off" | "on";
  express: boolean;
  pose: TPose;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** the chapter the anchor line sits in — the last one whose top has passed it —
 *  and how far through that chapter the line is. */
export function tour_pos(boxes: IBox[], anchor: number): ITourPos {
  let chapter = 0;
  boxes.forEach((b, i) => {
    if (b.top <= anchor) chapter = i;
  });
  const box = boxes[chapter];
  if (!box || box.height <= 0) return { chapter, progress: 0 };
  return { chapter, progress: clamp01((anchor - box.top) / box.height) };
}

/** which of `count` equal steps `progress` falls in; 1 is the last step */
export const step_at = (progress: number, count: number) =>
  Math.min(count - 1, Math.floor(clamp01(progress) * count));

const SCREENSHOT: IFrame = {
  view: "form",
  method: "stripe",
  frequency: "one-time",
  amount: "10",
  accent: 0,
  tip: "hidden",
  express: true,
  pose: "gift",
};

/** the replica's state for a point in the tour. chapter 0 is the production
 *  screenshot; each later chapter advances the same gift one step. */
export function frame_of({ chapter, progress }: ITourPos): IFrame {
  const monthly: IFrame = { ...SCREENSHOT, frequency: "monthly", amount: "50" };
  switch (chapter) {
    case 0:
      return SCREENSHOT;
    case 1: {
      const method = METHODS[step_at(progress, METHODS.length)];
      return { ...monthly, method, pose: METHOD_POSE[method] };
    }
    case 2:
      return {
        ...monthly,
        accent: step_at(progress, ACCENT_COUNT),
        pose: "announce",
      };
    case 3:
      return {
        ...monthly,
        tip: progress < 0.5 ? "off" : "on",
        express: false,
        pose: "like",
      };
    default:
      return { ...monthly, view: "thanks", express: false, pose: "cheering" };
  }
}
