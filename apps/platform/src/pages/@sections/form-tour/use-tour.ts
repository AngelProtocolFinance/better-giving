import {
  type RefObject,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { type ITourPos, tour_pos } from "./progress";

const REDUCE = "(prefers-reduced-motion: reduce)";

const subscribe_reduce = (on_change: () => void) => {
  const mq = window.matchMedia(REDUCE);
  mq.addEventListener("change", on_change);
  return () => mq.removeEventListener("change", on_change);
};

/** the first read lands before the browser paints, so a reload mid-page never
 *  shows chapter 0's frame; the server has no layout to read and keeps it */
export const use_before_paint =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export interface ITour extends ITourPos {
  reduced: boolean;
}

/** where the viewport's centre line sits among the `[data-tour-chapter]`
 *  elements under `root`. one passive scroll reader, throttled to a frame —
 *  never a wheel handler, a snap or a scroll override, so the page scrolls
 *  exactly as it would without the tour. the server, and the first client
 *  render, read chapter 0 at 0, which is what keeps hydration matched.
 *  `layout` names the arrangement the chapters are in; a change of it moves
 *  every chapter without a scroll, so it re-reads. */
export function use_tour(
  root: RefObject<HTMLElement | null>,
  layout?: string
): ITour {
  const [pos, set_pos] = useState<ITourPos>({ chapter: 0, progress: 0 });
  const reduced = useSyncExternalStore(
    subscribe_reduce,
    () => window.matchMedia(REDUCE).matches,
    () => false
  );

  use_before_paint(() => {
    const el = root.current;
    if (!el) return;
    let raf = 0;
    const read = () => {
      raf = 0;
      const boxes = [
        ...el.querySelectorAll<HTMLElement>("[data-tour-chapter]"),
      ].map((c) => {
        const r = c.getBoundingClientRect();
        return { top: r.top, height: r.height };
      });
      const next = tour_pos(boxes, window.innerHeight / 2);
      // two decimals is finer than any frame boundary the tour draws, and keeps
      // a slow scroll from re-rendering the stage on every pixel
      next.progress = Math.round(next.progress * 100) / 100;
      set_pos((prev) =>
        prev.chapter === next.chapter && prev.progress === next.progress
          ? prev
          : next
      );
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [root, layout]);

  return { ...pos, reduced };
}
