import { useCallback, useEffect, useRef, useState } from "react";

interface ICropBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface IDragState {
  mode: "move" | "resize";
  corner?: "nw" | "ne" | "sw" | "se";
  start_x: number;
  start_y: number;
  start_crop: ICropBox;
}

const HANDLE_SIZE = 10;
const MIN_CROP_PX = 30;

const OUTPUT_SIZES: Record<string, [number, number]> = {
  "1/1": [315, 315],
  "2/1": [792, 396],
  "4/1": [1584, 396],
};

function get_output_size(aspect: [number, number]): [number, number] {
  return (
    OUTPUT_SIZES[`${aspect[0]}/${aspect[1]}`] ?? [
      aspect[0] * 396,
      aspect[1] * 396,
    ]
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

type Corner = "nw" | "ne" | "sw" | "se";

const CURSOR_MAP: Record<Corner, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
};

interface IUseCropperArgs {
  aspect: [number, number];
}

export function use_cropper({ aspect }: IUseCropperArgs) {
  const container_ref = useRef<HTMLDivElement>(null);
  const img_ref = useRef<HTMLImageElement>(null);
  const aspect_ref = useRef(aspect);
  aspect_ref.current = aspect;

  const [crop, set_crop] = useState<ICropBox>({ x: 0, y: 0, w: 0, h: 0 });
  const crop_ref = useRef(crop);
  crop_ref.current = crop;

  const drag_ref = useRef<IDragState | null>(null);
  const img_layout_ref = useRef({ x: 0, y: 0, w: 0, h: 0, scale: 1 });
  const container_size_ref = useRef({ w: 0, h: 0 });

  const [ready, set_ready] = useState(false);

  const compute_layout = useCallback(() => {
    const container = container_ref.current;
    const img = img_ref.current;
    if (!container || !img?.naturalWidth) return;

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    container_size_ref.current = { w: cw, h: ch };

    // image "cover" sizing
    const img_ar = img.naturalWidth / img.naturalHeight;
    const container_ar = cw / ch;
    let iw: number;
    let ih: number;
    if (img_ar > container_ar) {
      ih = ch;
      iw = ih * img_ar;
    } else {
      iw = cw;
      ih = iw / img_ar;
    }
    const ix = (cw - iw) / 2;
    const iy = (ch - ih) / 2;
    img_layout_ref.current = {
      x: ix,
      y: iy,
      w: iw,
      h: ih,
      scale: iw / img.naturalWidth,
    };

    // position image
    img.style.left = `${ix}px`;
    img.style.top = `${iy}px`;
    img.style.width = `${iw}px`;
    img.style.height = `${ih}px`;

    // initial crop at 80%, centered
    const iw80 = cw * 0.8;
    const ih80 = ch * 0.8;
    set_crop({
      x: (cw - iw80) / 2,
      y: (ch - ih80) / 2,
      w: iw80,
      h: ih80,
    });
  }, []);

  useEffect(() => {
    const el = container_ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => compute_layout());
    ro.observe(el);
    return () => ro.disconnect();
  }, [compute_layout]);

  const on_image_load = useCallback(() => {
    compute_layout();
    set_ready(true);
  }, [compute_layout]);

  // -- hit testing --

  function get_corner(px: number, py: number): Corner | null {
    const { x, y, w, h } = crop_ref.current;
    const corners: { name: Corner; cx: number; cy: number }[] = [
      { name: "nw", cx: x, cy: y },
      { name: "ne", cx: x + w, cy: y },
      { name: "sw", cx: x, cy: y + h },
      { name: "se", cx: x + w, cy: y + h },
    ];
    for (const c of corners) {
      if (
        Math.abs(px - c.cx) <= HANDLE_SIZE &&
        Math.abs(py - c.cy) <= HANDLE_SIZE
      )
        return c.name;
    }
    return null;
  }

  function is_inside(px: number, py: number): boolean {
    const { x, y, w, h } = crop_ref.current;
    return px >= x && px <= x + w && py >= y && py <= y + h;
  }

  function local(e: React.PointerEvent) {
    const rect = container_ref.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // -- pointer handlers --

  function on_pointer_down(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const { x: px, y: py } = local(e);

    const corner = get_corner(px, py);
    if (corner) {
      drag_ref.current = {
        mode: "resize",
        corner,
        start_x: px,
        start_y: py,
        start_crop: { ...crop_ref.current },
      };
    } else if (is_inside(px, py)) {
      drag_ref.current = {
        mode: "move",
        start_x: px,
        start_y: py,
        start_crop: { ...crop_ref.current },
      };
    }
  }

  function on_pointer_move(e: React.PointerEvent) {
    const { x: px, y: py } = local(e);
    const drag = drag_ref.current;

    if (!drag) {
      // hover cursor
      const el = container_ref.current;
      if (!el) return;
      const corner = get_corner(px, py);
      if (corner) el.style.cursor = CURSOR_MAP[corner];
      else if (is_inside(px, py)) el.style.cursor = "move";
      else el.style.cursor = "default";
      return;
    }

    const { w: cw, h: ch } = container_size_ref.current;
    const ar = aspect_ref.current[0] / aspect_ref.current[1];
    const s = drag.start_crop;

    let next: ICropBox;

    if (drag.mode === "move") {
      const dx = px - drag.start_x;
      const dy = py - drag.start_y;
      next = {
        x: clamp(s.x + dx, 0, cw - s.w),
        y: clamp(s.y + dy, 0, ch - s.h),
        w: s.w,
        h: s.h,
      };
    } else {
      next = resize_from_corner(drag.corner!, px, s, ar, cw, ch);
    }

    crop_ref.current = next;
    set_crop(next);
  }

  function on_pointer_up(_e: React.PointerEvent) {
    drag_ref.current = null;
  }

  // -- crop output --

  const get_cropped_blob = useCallback((): Promise<Blob | null> => {
    const img = img_ref.current;
    if (!img) return Promise.resolve(null);

    const c = crop_ref.current;
    const layout = img_layout_ref.current;
    const [out_w, out_h] = get_output_size(aspect_ref.current);

    const sx = (c.x - layout.x) / layout.scale;
    const sy = (c.y - layout.y) / layout.scale;
    const sw = c.w / layout.scale;
    const sh = c.h / layout.scale;

    const canvas = document.createElement("canvas");
    canvas.width = out_w;
    canvas.height = out_h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, out_w, out_h);

    return new Promise((resolve) => canvas.toBlob(resolve));
  }, []);

  return {
    container_ref,
    img_ref,
    crop,
    on_image_load,
    on_pointer_down,
    on_pointer_move,
    on_pointer_up,
    get_cropped_blob,
    ready,
  };
}

// -- resize helpers --

function resize_from_corner(
  corner: Corner,
  px: number,
  s: ICropBox,
  ar: number,
  cw: number,
  ch: number
): ICropBox {
  // each corner has a fixed anchor (opposite corner)
  // width is driven by pointer x; height follows from aspect ratio
  // if height overflows, height drives instead
  switch (corner) {
    case "se": {
      const ax = s.x;
      const ay = s.y;
      let w = clamp(px - ax, MIN_CROP_PX, cw - ax);
      let h = w / ar;
      if (ay + h > ch) {
        h = ch - ay;
        w = h * ar;
      }
      return { x: ax, y: ay, w, h };
    }
    case "sw": {
      const ax = s.x + s.w;
      const ay = s.y;
      let w = clamp(ax - px, MIN_CROP_PX, ax);
      let h = w / ar;
      if (ay + h > ch) {
        h = ch - ay;
        w = h * ar;
      }
      return { x: ax - w, y: ay, w, h };
    }
    case "ne": {
      const ax = s.x;
      const ay = s.y + s.h;
      let w = clamp(px - ax, MIN_CROP_PX, cw - ax);
      let h = w / ar;
      if (ay - h < 0) {
        h = ay;
        w = h * ar;
      }
      return { x: ax, y: ay - h, w, h };
    }
    case "nw": {
      const ax = s.x + s.w;
      const ay = s.y + s.h;
      let w = clamp(ax - px, MIN_CROP_PX, ax);
      let h = w / ar;
      if (ay - h < 0) {
        h = ay;
        w = h * ar;
      }
      return { x: ax - w, y: ay - h, w, h };
    }
  }
}
