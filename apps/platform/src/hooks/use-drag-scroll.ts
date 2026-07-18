import { type RefObject, useEffect } from "react";

/** enables mouse drag-to-scroll with flick-to-snap on a scroll-snap container */
export function use_drag_scroll(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let is_down = false;
    let start_x = 0;
    let scroll_left = 0;
    let last_x = 0;
    let last_time = 0;
    let velocity = 0;

    const on_dragstart = (e: Event) => e.preventDefault();

    const on_down = (e: MouseEvent) => {
      is_down = true;
      start_x = e.pageX;
      last_x = e.pageX;
      last_time = Date.now();
      velocity = 0;
      scroll_left = el.scrollLeft;
      el.style.scrollSnapType = "none";
      el.style.scrollBehavior = "auto";
      el.style.cursor = "grabbing";
      el.style.userSelect = "none";
    };

    const on_move = (e: MouseEvent) => {
      if (!is_down) return;
      e.preventDefault();
      const now = Date.now();
      const dt = now - last_time;
      if (dt > 0) velocity = (e.pageX - last_x) / dt;
      last_x = e.pageX;
      last_time = now;
      el.scrollLeft = scroll_left - (e.pageX - start_x);
    };

    const on_up = () => {
      if (!is_down) return;
      is_down = false;

      // find the nearest snap target based on drag direction + velocity
      const child = el.firstElementChild;
      if (child) {
        const slide_w = child.getBoundingClientRect().width;
        const current = el.scrollLeft / slide_w;
        // velocity > 0 = dragged right = go prev, < 0 = dragged left = go next
        const threshold = 0.15; // px/ms — light flick is enough
        let target: number;
        if (velocity > threshold) {
          target = Math.floor(current);
        } else if (velocity < -threshold) {
          target = Math.ceil(current);
        } else {
          target = Math.round(current);
        }
        const max = Math.round((el.scrollWidth - el.clientWidth) / slide_w);
        target = Math.max(0, Math.min(target, max));
        el.style.scrollBehavior = "smooth";
        el.scrollLeft = target * slide_w;
      }

      // re-enable snap after smooth scroll settles
      requestAnimationFrame(() => {
        el.style.scrollSnapType = "";
        el.style.scrollBehavior = "";
        el.style.cursor = "";
        el.style.userSelect = "";
      });
    };

    el.addEventListener("dragstart", on_dragstart);
    el.addEventListener("mousedown", on_down);
    el.addEventListener("mousemove", on_move);
    el.addEventListener("mouseup", on_up);
    el.addEventListener("mouseleave", on_up);

    return () => {
      el.removeEventListener("dragstart", on_dragstart);
      el.removeEventListener("mousedown", on_down);
      el.removeEventListener("mousemove", on_move);
      el.removeEventListener("mouseup", on_up);
      el.removeEventListener("mouseleave", on_up);
    };
  }, [ref]);
}
