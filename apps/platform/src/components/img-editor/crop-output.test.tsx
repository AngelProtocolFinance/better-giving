import { afterEach, describe, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { upload_limits, upload_signatures } from "@/constants/upload";
import "#/index.css";
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

async function save_crop(input: File, aspect: [number, number]): Promise<File> {
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
  const save = page.getByRole("button", { name: "Save cropped image" });
  (save.element() as HTMLElement).click();
  await vi.waitFor(() => expect(file).toBeInstanceOf(File));
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
