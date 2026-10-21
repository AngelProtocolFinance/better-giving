import { afterEach, describe, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { upload_limits, upload_signatures } from "@/constants/upload";
import "#/index.css";
import { paint_crop } from "./crop-output";
import { ImgCropper } from "./img-cropper";

afterEach(async () => {
  await cleanup();
});

/** a real encoded file, so the bytes the cropper is handed are the type it claims */
function canvas_file(
  w: number,
  h: number,
  type: string,
  name: string,
  paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  paint(ctx, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error(`toBlob ${type}`));
        else resolve(new File([blob], name, { type }));
      },
      type,
      0.92
    );
  });
}

const fill =
  (color: string) => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
  };

/** square photo with a circle, so a stretch shows up as an ellipse */
const circle = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#e10600";
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.4, 0, Math.PI * 2);
  ctx.fill();
};

async function save_crop(
  input: File,
  aspect: [number, number],
  adjust?: () => Promise<void>
): Promise<File> {
  let file: File | undefined;
  await render(
    <ImgCropper
      open
      input={input}
      aspect={aspect}
      resolve={(next) => {
        file = next;
      }}
      on_closed={() => {}}
    />
  );
  await vi.waitFor(() => {
    const img = document.querySelector(
      '[data-scope="image-cropper"][data-part="image"]'
    ) as HTMLImageElement | null;
    const sel = document.querySelector(
      '[data-scope="image-cropper"][data-part="selection"]'
    );
    expect(img?.complete && (img?.naturalWidth ?? 0) > 0).toBe(true);
    expect(getComputedStyle(img!).objectFit).toBe("contain");
    expect(sel?.getBoundingClientRect().width ?? 0).toBeGreaterThan(20);
  });
  if (adjust) await adjust();
  const save = page.getByRole("button", { name: "Save cropped image" });
  (save.element() as HTMLElement).click();
  // canvas.toBlob encodes in an idle task, which chromium runs after 1s at the
  // latest. a file entered right after another one's page.viewport() change
  // (admin.$id.campaigns/page.test.tsx) starts with the page unable to go idle,
  // so every encode in it takes that full 1s, the default vi.waitFor timeout.
  await vi.waitFor(() => expect(file).toBeInstanceOf(File), { timeout: 5_000 });
  return file!;
}

function agrees(type: string, name: string, head: Uint8Array): boolean {
  const sig = upload_signatures[type];
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  return (
    !!sig &&
    sig.every((b, i) => b === null || head[i] === b) &&
    (upload_limits.types[type] ?? []).includes(ext)
  );
}

async function red_box(file: Blob) {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bmp, 0, 0);
  const data = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
  let min_x = bmp.width;
  let min_y = bmp.height;
  let max_x = -1;
  let max_y = -1;
  for (let y = 0; y < bmp.height; y++) {
    for (let x = 0; x < bmp.width; x++) {
      const i = (y * bmp.width + x) * 4;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      if (r > 180 && g < 80 && b < 80) {
        if (x < min_x) min_x = x;
        if (y < min_y) min_y = y;
        if (x > max_x) max_x = x;
        if (y > max_y) max_y = y;
      }
    }
  }
  return {
    width: bmp.width,
    height: bmp.height,
    w: max_x - min_x + 1,
    h: max_y - min_y + 1,
  };
}

describe("cropped file type matches its bytes", () => {
  test.each([
    ["image/jpeg", "photo.jpeg"],
    ["image/webp", "photo.webp"],
    ["image/png", "photo.png"],
  ])(
    "a cropped %s keeps that type, extension, and signature",
    async (type, name) => {
      const input = await canvas_file(240, 160, type, name, fill("#336699"));
      const file = await save_crop(input, [4, 1]);
      const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      const bmp = await createImageBitmap(file);
      expect(bmp.width).toBe(1584);
      expect(bmp.height).toBe(396);
      expect(
        agrees(file.type, file.name, head),
        `${file.name} ${file.type} ${[...head.slice(0, 12)]}`
      ).toBe(true);
      expect(file.type).toBe(type);
    }
  );

  test("a cropped svg is labeled png, because the crop is a raster", async () => {
    const svg = new File(
      [
        '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#e10600"/></svg>',
      ],
      "mark.svg",
      { type: "image/svg+xml" }
    );
    const file = await save_crop(svg, [4, 1]);
    const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    expect(file.type).toBe("image/png");
    expect(file.name).toBe("mark.png");
    expect(agrees(file.type, file.name, head)).toBe(true);
    const bmp = await createImageBitmap(file);
    expect(bmp.width).toBe(1584);
    expect(bmp.height).toBe(396);
  });
});

describe("crop output keeps the photo's aspect", () => {
  test("a circle on the banner stays a circle inside 1584x396", async () => {
    const input = await canvas_file(
      200,
      200,
      "image/png",
      "square.png",
      circle
    );
    const file = await save_crop(input, [4, 1]);
    const box = await red_box(file);
    const aspect = box.w / box.h;
    expect(box.width).toBe(1584);
    expect(box.height).toBe(396);
    expect(aspect, `red box ${box.w}x${box.h}`).toBeGreaterThan(0.8);
    expect(aspect).toBeLessThan(1.2);
    expect(box.w / box.width).toBeLessThan(0.5);
  });

  test("a wide logo is not squashed into the square", async () => {
    const input = await canvas_file(
      400,
      100,
      "image/png",
      "wide.png",
      fill("#e10600")
    );
    const file = await save_crop(input, [1, 1]);
    const box = await red_box(file);
    expect(box.width).toBe(315);
    expect(box.height).toBe(315);
    expect(box.w / box.width, `red ${box.w}x${box.h}`).toBeGreaterThan(0.9);
    expect(box.h / box.height).toBeLessThan(0.5);
    // the bars above and below a wide opaque photo stay the black letterbox
    const top = await pixel_at(file, Math.floor(box.width / 2), 2);
    expect(top.a).toBeGreaterThan(250);
    expect(top.r + top.g + top.b).toBeLessThan(40);
  });

  test("a square card image is not stretched across 2:1", async () => {
    const input = await canvas_file(
      200,
      200,
      "image/png",
      "square.png",
      fill("#e10600")
    );
    const file = await save_crop(input, [2, 1]);
    const box = await red_box(file);
    expect(box.width).toBe(792);
    expect(box.height).toBe(396);
    expect(box.h / box.height, `red ${box.w}x${box.h}`).toBeGreaterThan(0.9);
    expect(box.w / box.width).toBeLessThan(0.8);
  });
});

/** a mark in the corner, so a flip, turn, or shift has somewhere to land */
const corner_mark = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#e10600";
  ctx.fillRect(0, 0, w * 0.2, h * 0.2);
};

/** clear ground with a red block inset, the shape of a transparent logo */
const clear_logo = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#e10600";
  ctx.fillRect(w * 0.3, h * 0.3, w * 0.4, h * 0.4);
};

interface IRgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

async function read_pixels(file: Blob) {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bmp, 0, 0);
  return {
    width: bmp.width,
    height: bmp.height,
    data: ctx.getImageData(0, 0, bmp.width, bmp.height).data,
  };
}

function rgba_at(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number
): IRgba {
  const i = (y * width + x) * 4;
  return {
    r: data[i] ?? 0,
    g: data[i + 1] ?? 0,
    b: data[i + 2] ?? 0,
    a: data[i + 3] ?? 0,
  };
}

async function pixel_at(file: Blob, x: number, y: number): Promise<IRgba> {
  const bmp = await read_pixels(file);
  return rgba_at(bmp.data, bmp.width, x, y);
}

function is_red(px: IRgba): boolean {
  return px.a > 200 && px.r > 180 && px.g < 80 && px.b < 80;
}

function is_blue(px: IRgba): boolean {
  return px.a > 200 && px.b > 150 && px.r < 80 && px.g < 100;
}

function count_where(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  pred: (px: IRgba) => boolean
): number {
  let n = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pred(rgba_at(data, width, x, y))) n++;
    }
  }
  return n;
}

function crop_metrics() {
  const root = document.querySelector(
    '[data-scope="image-cropper"][data-part="root"]'
  ) as HTMLElement | null;
  if (!root) throw new Error("no cropper");
  const px = (name: string) =>
    Number.parseFloat(root.style.getPropertyValue(name));
  return {
    x: px("--crop-x"),
    w: px("--crop-width"),
    zoom: px("--image-zoom"),
  };
}

async function key_selection(
  key: string,
  mods: { altKey?: boolean; ctrlKey?: boolean } = {}
) {
  const sel = document.querySelector(
    '[data-scope="image-cropper"][data-part="selection"]'
  ) as HTMLElement | null;
  if (!sel) throw new Error("no selection");
  sel.focus();
  sel.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      altKey: !!mods.altKey,
      ctrlKey: !!mods.ctrlKey,
    })
  );
  // a burst of keydowns in one task is applied once; yield so each nudge lands
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const PAINT_SIZE = 200;

function paint_source(
  paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
) {
  const source = document.createElement("canvas");
  source.width = PAINT_SIZE;
  source.height = PAINT_SIZE;
  const src_ctx = source.getContext("2d");
  if (!src_ctx) throw new Error("no canvas");
  paint(src_ctx, PAINT_SIZE, PAINT_SIZE);
  const out = document.createElement("canvas");
  out.width = PAINT_SIZE;
  out.height = PAINT_SIZE;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  const geom = {
    viewport: { width: PAINT_SIZE, height: PAINT_SIZE },
    crop: { x: 0, y: 0, width: PAINT_SIZE, height: PAINT_SIZE },
    zoom: 1,
    offset: { x: 0, y: 0 },
    rotation: 0,
    flip_x: false,
    flip_y: false,
    out_w: PAINT_SIZE,
    out_h: PAINT_SIZE,
    background: "#000000",
  };
  return {
    source,
    out,
    ctx,
    paint(over: Partial<typeof geom>) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, PAINT_SIZE, PAINT_SIZE);
      ctx.globalCompositeOperation = "source-over";
      paint_crop(
        ctx,
        source,
        { width: PAINT_SIZE, height: PAINT_SIZE },
        {
          ...geom,
          ...over,
        }
      );
      return ctx.getImageData(0, 0, PAINT_SIZE, PAINT_SIZE);
    },
  };
}

describe("transparent logos stay clear", () => {
  test.each([
    ["image/png", "logo.png"],
    ["image/webp", "logo.webp"],
  ])("a cropped %s keeps the logo's clear pixels", async (type, name) => {
    const input = await canvas_file(200, 200, type, name, clear_logo);
    const file = await save_crop(input, [1, 1]);
    const bmp = await read_pixels(file);
    const corner = rgba_at(bmp.data, bmp.width, 2, 2);
    const mid = Math.floor(bmp.width / 2);
    const center = rgba_at(bmp.data, bmp.width, mid, mid);
    expect(corner.a, `${type} corner alpha`).toBe(0);
    expect(
      is_red(center),
      `${type} center ${center.r},${center.g},${center.b},${center.a}`
    ).toBe(true);
  });

  test("letterbox around a clear logo stays black, the holes do not", () => {
    const painted = paint_source(clear_logo);
    const shrunk = painted.paint({ zoom: 0.5 });
    const hole = rgba_at(shrunk.data, PAINT_SIZE, 70, 100);
    const bar = rgba_at(shrunk.data, PAINT_SIZE, 2, 100);
    const mark = rgba_at(shrunk.data, PAINT_SIZE, 100, 100);
    expect(hole.a, "in-image clear pixel").toBe(0);
    expect(bar.a, "letterbox alpha").toBe(255);
    expect(bar.r + bar.g + bar.b).toBe(0);
    expect(is_red(mark)).toBe(true);
  });
});

describe("adjusted crops change the saved pixels", () => {
  test("moving the selection off a left-hand mark drops it from the file", async () => {
    const input = await canvas_file(
      240,
      240,
      "image/png",
      "split.png",
      (ctx, w, h) => {
        ctx.fillStyle = "#e10600";
        ctx.fillRect(0, 0, w / 2, h);
        ctx.fillStyle = "#0033cc";
        ctx.fillRect(w / 2, 0, w / 2, h);
      }
    );
    const file = await save_crop(input, [1, 1], async () => {
      const start = crop_metrics();
      // shrink from the right edge, then slide that window into the blue half
      for (let i = 0; i < 20 && crop_metrics().w > start.w * 0.25; i++) {
        await key_selection("ArrowLeft", { altKey: true, ctrlKey: true });
      }
      expect(crop_metrics().w).toBeLessThan(start.w * 0.3);
      const into_blue = start.w * 0.6;
      for (let i = 0; i < 20 && crop_metrics().x < into_blue; i++) {
        await key_selection("ArrowRight", { ctrlKey: true });
      }
      expect(crop_metrics().x).toBeGreaterThanOrEqual(into_blue);
    });
    const bmp = await read_pixels(file);
    const red = count_where(bmp.data, bmp.width, bmp.height, is_red);
    const blue = count_where(bmp.data, bmp.width, bmp.height, is_blue);
    expect(blue, `red ${red} blue ${blue}`).toBeGreaterThan(red * 5);
    expect(blue).toBeGreaterThan(50);
  });

  test("zooming past an edge mark removes it from the file", async () => {
    const input = await canvas_file(
      200,
      200,
      "image/png",
      "edge.png",
      corner_mark
    );
    const file = await save_crop(input, [1, 1], async () => {
      for (let i = 0; i < 25 && crop_metrics().zoom < 3; i++) {
        await key_selection("+");
      }
      expect(crop_metrics().zoom).toBeGreaterThanOrEqual(3);
    });
    const bmp = await read_pixels(file);
    const red = count_where(bmp.data, bmp.width, bmp.height, is_red);
    const mid = Math.floor(bmp.width / 2);
    const center = rgba_at(bmp.data, bmp.width, mid, mid);
    expect(red).toBeLessThan(30);
    expect(center.r).toBeGreaterThan(240);
    expect(center.g).toBeGreaterThan(240);
    expect(center.b).toBeGreaterThan(240);
  });

  test("flip, rotation, offset, and zoom move the corner mark", () => {
    const painted = paint_source(corner_mark);
    const at = (data: ImageData, x: number, y: number) =>
      rgba_at(data.data, PAINT_SIZE, x, y);
    const plain = painted.paint({});
    expect(is_red(at(plain, 20, 20))).toBe(true);
    expect(is_red(at(plain, 180, 20))).toBe(false);

    const flip_x = painted.paint({ flip_x: true });
    expect(is_red(at(flip_x, 180, 20))).toBe(true);
    expect(is_red(at(flip_x, 20, 20))).toBe(false);

    const flip_y = painted.paint({ flip_y: true });
    expect(is_red(at(flip_y, 20, 180))).toBe(true);
    expect(is_red(at(flip_y, 20, 20))).toBe(false);

    const turned = painted.paint({ rotation: 180 });
    expect(is_red(at(turned, 180, 180))).toBe(true);
    expect(is_red(at(turned, 20, 20))).toBe(false);

    const shifted = painted.paint({ offset: { x: 30, y: 0 } });
    expect(is_red(at(shifted, 50, 20))).toBe(true);
    const gap = at(shifted, 5, 20);
    expect(gap.a).toBe(255);
    expect(gap.r + gap.g + gap.b).toBe(0);

    const zoomed = painted.paint({ zoom: 4 });
    const red = count_where(zoomed.data, PAINT_SIZE, PAINT_SIZE, is_red);
    expect(red).toBe(0);
    expect(at(zoomed, 100, 100).r).toBeGreaterThan(240);
  });
});
